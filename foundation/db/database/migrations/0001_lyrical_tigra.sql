ALTER TABLE "organization_invitations" DROP CONSTRAINT "organization_invitations_access_check";--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_access_check" CHECK (("organization_invitations"."purpose" = 'provisioning' AND "organization_invitations"."administration" = 'owner' AND "organization_invitations"."role" = 'program_manager') OR ("organization_invitations"."purpose" = 'team' AND "organization_invitations"."administration" IN ('none', 'administrator') AND "organization_invitations"."role" IN ('member', 'program_manager', 'reviewer')));--> statement-breakpoint
-- Preserve only still-entitled legacy external access. Paused conflicts and ended
-- invitations receive no membership; they must join through Organizations first.
-- An assignment already bound to a removed membership is never rebound here.
INSERT INTO memberships (organization_id, user_id, email, role)
SELECT DISTINCT ON (a.organization_id, a.reviewer_user_id)
  a.organization_id, a.reviewer_user_id, a.email, 'reviewer'
FROM review_assignments a
JOIN app_users u ON u.id = a.reviewer_user_id AND u.active
JOIN organizations o ON o.id = a.organization_id AND o.kind = 'standard'
WHERE a.status IN ('accepted', 'submitted') AND a.membership_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM audit_events e
    WHERE e.organization_id = a.organization_id AND e.target_type = 'membership'
      AND e.target_id = a.reviewer_user_id AND e.recorded_at >= a.accepted_at
      AND (e.action = 'membership.removed' OR
        (e.action = 'membership.access_changed' AND e.details->'after'->>'role' NOT IN ('reviewer', 'program_manager')))
  )
ORDER BY a.organization_id, a.reviewer_user_id, a.created_at DESC, a.id
ON CONFLICT (organization_id, user_id) DO NOTHING;
--> statement-breakpoint
UPDATE review_assignments a SET membership_id = m.id
FROM memberships m, app_users u, organizations o
WHERE a.membership_id IS NULL AND a.status IN ('accepted', 'submitted')
  AND m.organization_id = a.organization_id AND m.user_id = a.reviewer_user_id
  AND m.role IN ('reviewer', 'program_manager')
  AND u.id = a.reviewer_user_id AND u.active
  AND o.id = a.organization_id AND o.kind = 'standard'
  AND NOT EXISTS (
    SELECT 1 FROM audit_events e
    WHERE e.organization_id = a.organization_id AND e.target_type = 'membership'
      AND e.target_id = a.reviewer_user_id AND e.recorded_at >= a.accepted_at
      AND (e.action = 'membership.removed' OR
        (e.action = 'membership.access_changed' AND e.details->'after'->>'role' NOT IN ('reviewer', 'program_manager')))
  );
