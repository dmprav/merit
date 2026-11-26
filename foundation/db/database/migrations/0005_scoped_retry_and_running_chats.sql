-- A retry revives only a message that could be delivered: an invitation also needs its
-- assignment still invited and unexpired, as the pending-message listing requires. A revoked or
-- expired invitation stays failed instead of being queued for a workflow that cannot send it.
CREATE OR REPLACE FUNCTION merit_retry_reviewer_message(message_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH reset AS (
    UPDATE public.reviewer_messages m
      SET status = 'pending', delivery_token = gen_random_uuid()
      WHERE m.id = message_id AND m.status = 'failed'
        AND (public.merit_scope()->>'kind') = 'workspace'
        AND NOT EXISTS (
          SELECT 1 FROM public.reviewer_messages newer
          WHERE newer.assignment_id = m.assignment_id AND newer.kind = m.kind
            AND (newer.created_at, newer.id) > (m.created_at, m.id))
        AND EXISTS (
          SELECT 1 FROM public.review_assignments a
          WHERE a.id = m.assignment_id AND a.organization_id IN (SELECT public.merit_workspace_ids())
            AND (m.kind = 'submission' OR (a.status = 'invited' AND a.expires_at > clock_timestamp())))
      RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM reset)
$$;
--> statement-breakpoint
-- Withdrawing consent ends every member's running chats in the workspace, and a member's chats
-- are private to them. An administrator of the scoped workspace learns only the IDs of its running
-- chats, so Merit can cancel their work; nothing is returned to anyone else or for another
-- workspace. Call it before the consent is deleted, in the administrator's own transaction.
CREATE FUNCTION merit_workspace_running_assistant_conversations() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT c.id FROM public.assistant_conversations c
  WHERE c.status = 'running'
    AND (public.merit_scope()->>'kind') = 'workspace'
    AND c.organization_id IN (SELECT public.merit_workspace_ids())
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.organization_id = c.organization_id
        AND m.user_id = public.merit_scope()->>'userId'
        AND m.administration IN ('administrator', 'owner'))
  ORDER BY c.id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_workspace_running_assistant_conversations() FROM PUBLIC;
