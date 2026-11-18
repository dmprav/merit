-- Request context is supplied by trusted server code and lives only in its transaction.
CREATE FUNCTION merit_scope() RETURNS jsonb LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('merit.scope', true), '')::jsonb
$$;
--> statement-breakpoint
CREATE FUNCTION merit_workspace_active(kind text, expires_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT kind = 'standard' OR expires_at > statement_timestamp()
$$;
--> statement-breakpoint
-- The migration owner can read the membership directory without recursively invoking
-- its policies. These functions expose only IDs for the current transaction.
CREATE FUNCTION merit_workspace_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT o.id FROM public.organizations o
  JOIN public.memberships m ON m.organization_id = o.id
  JOIN public.app_users u ON u.id = m.user_id
  CROSS JOIN (SELECT public.merit_scope() AS scope) ctx
  WHERE u.id = scope->>'userId' AND u.active
    AND public.merit_workspace_active(o.kind, o.demo_expires_at)
    AND CASE scope->>'kind'
      WHEN 'workspace' THEN o.slug = scope->>'slug'
      WHEN 'discovery' THEN true
      WHEN 'assignment' THEN o.id = (
        SELECT a.organization_id FROM public.review_assignments a WHERE a.id = (scope->>'assignmentId')::uuid
      )
      ELSE false END
$$;
--> statement-breakpoint
-- Team operations distinguish a missing address from denied membership. Return
-- only that distinction for the requested slug, without exposing its organization row.
CREATE FUNCTION merit_team_workspace_exists() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations
    WHERE public.merit_scope()->>'kind' = 'workspace' AND slug = public.merit_scope()->>'slug')
$$;
--> statement-breakpoint
-- Provisioning, invitation acceptance and demo bootstrap operate on organization
-- metadata before the recipient has ordinary workspace access.
CREATE FUNCTION merit_onboarding_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH ctx AS (SELECT public.merit_scope() AS scope)
  SELECT scope->>'organizationId' FROM ctx WHERE scope->>'kind' = 'provision'
  UNION ALL SELECT i.organization_id FROM public.organization_invitations i, ctx
    WHERE scope->>'kind' = 'invitation' AND i.token_hash = scope->>'tokenHash'
  UNION ALL SELECT scope->>'newId' FROM ctx WHERE scope->>'kind' = 'demo'
  UNION ALL SELECT o.id FROM public.organizations o JOIN public.memberships m ON m.organization_id = o.id, ctx
    WHERE scope->>'kind' = 'demo' AND o.kind = 'demo' AND m.user_id = scope->>'userId'
$$;
--> statement-breakpoint
-- Child policies follow their indexed parent keys. Reads in discovery may span
-- active memberships; writes to grant data always require a single workspace.
DO $policies$
DECLARE
  entry record;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('organization_id IN (SELECT merit_workspace_ids())', ARRAY[
      'application_cases', 'application_creation_receipts', 'audit_events', 'contacts',
      'funding_rounds', 'round_creation_receipts', 'review_assignments',
      'assessment_versions', 'assessments', 'review_requests']),
    ('EXISTS (SELECT 1 FROM application_cases parent WHERE parent.id = case_id)', ARRAY[
      'material_draft_answers', 'material_drafts', 'material_version_answers',
      'material_version_evidence', 'material_versions', 'recommendation_versions',
      'assessment_version_observations', 'review_states']),
    ('EXISTS (SELECT 1 FROM funding_rounds parent WHERE parent.id = round_id)', ARRAY[
      'criteria_version_items', 'criteria_versions']),
    ('EXISTS (SELECT 1 FROM review_assignments parent WHERE parent.id = assignment_id)', ARRAY[
      'reviewer_command_receipts', 'reviewer_draft_observations', 'reviewer_drafts', 'reviewer_messages'])
  ) AS groups(predicate, tables) CROSS JOIN LATERAL unnest(tables) AS relation(name)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', entry.name);
    EXECUTE format('CREATE POLICY workspace_read ON %I FOR SELECT USING (%s)', entry.name, entry.predicate);
    EXECUTE format('CREATE POLICY workspace_write ON %I FOR ALL USING
      ((SELECT merit_scope()->>''kind'') IN (''workspace'', ''assignment'') AND %s)', entry.name, entry.predicate);
  END LOOP;
END $policies$;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_access ON organizations USING
  ((id IN (SELECT merit_workspace_ids()) AND (SELECT merit_scope()->>'kind') <> 'discovery')
   OR id IN (SELECT merit_onboarding_ids()));
CREATE POLICY discovery ON organizations FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'discovery' AND id IN (SELECT merit_workspace_ids()));
CREATE POLICY operator_directory ON organizations FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'organization_directory');
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_access ON memberships USING
  ((organization_id IN (SELECT merit_workspace_ids()) AND (SELECT merit_scope()->>'kind') <> 'discovery')
   OR organization_id IN (SELECT merit_onboarding_ids()));
CREATE POLICY discovery ON memberships FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'discovery' AND organization_id IN (SELECT merit_workspace_ids()));
CREATE POLICY operator_directory ON memberships FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'organization_directory' AND administration = 'owner');
--> statement-breakpoint
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_access ON organization_invitations USING (
  (organization_id IN (SELECT merit_workspace_ids()) AND (SELECT merit_scope()->>'kind') = 'workspace') OR
  ((SELECT merit_scope()->>'kind') = 'provision' AND organization_id IN (SELECT merit_onboarding_ids())) OR
  ((SELECT merit_scope()->>'kind') = 'invitation' AND token_hash = (SELECT merit_scope()->>'tokenHash'))
);
CREATE POLICY operator_directory ON organization_invitations FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'organization_directory' AND purpose = 'provisioning');
--> statement-breakpoint
CREATE POLICY onboarding_event ON audit_events FOR INSERT WITH CHECK
  (organization_id IN (SELECT merit_onboarding_ids()) AND target_type IN ('organization', 'team_invitation', 'membership'));
--> statement-breakpoint
ALTER TABLE grant_navigation_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_navigation ON grant_navigation_pins USING (
  (SELECT merit_scope()->>'kind') = 'discovery' AND user_id = (SELECT merit_scope()->>'userId')
  AND EXISTS (SELECT 1 FROM app_users u WHERE u.id = user_id AND u.active)
);
