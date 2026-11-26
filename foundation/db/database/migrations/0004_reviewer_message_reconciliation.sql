-- Reconciliation restarts delivery for every pending message, so it lists only messages whose
-- acting member can still deliver them: an active user with a membership in a workspace that is
-- still active. The rest wait until access returns instead of restarting forever.
CREATE OR REPLACE FUNCTION merit_pending_reviewer_messages(batch_size integer, after_id uuid)
RETURNS TABLE ("messageId" uuid, "assignmentId" uuid, kind text, "userId" text)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.id, m.assignment_id, m.kind, actor.user_id
  FROM public.reviewer_messages m
  JOIN public.review_assignments a ON a.id = m.assignment_id
  JOIN public.organizations o ON o.id = a.organization_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN m.kind = 'submission' THEN coalesce(a.reviewer_user_id, a.manager_user_id)
      ELSE a.manager_user_id END AS user_id) actor
  JOIN public.app_users u ON u.id = actor.user_id AND u.active
  WHERE m.status = 'pending' AND m.id > after_id
    AND public.merit_workspace_active(o.kind, o.demo_expires_at)
    AND EXISTS (
      SELECT 1 FROM public.memberships mb
      WHERE mb.organization_id = a.organization_id AND mb.user_id = actor.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.reviewer_messages newer
      WHERE newer.assignment_id = m.assignment_id AND newer.kind = m.kind
        AND (newer.created_at, newer.id) > (m.created_at, m.id))
    AND (m.kind = 'submission' OR (a.status = 'invited' AND a.expires_at > clock_timestamp()))
  ORDER BY m.id LIMIT greatest(0, least(batch_size, 100))
$$;
--> statement-breakpoint
-- A retry puts a failed message back to pending with a fresh delivery token, for a manager's
-- notice retry and for the assistant's retry of its own invitation. Only the newest message of its
-- kind can be revived, so a resend's older, failed message stays failed.
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
          WHERE a.id = m.assignment_id AND a.organization_id IN (SELECT public.merit_workspace_ids()))
      RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM reset)
$$;
--> statement-breakpoint
CREATE INDEX "reviewer_messages_pending" ON "reviewer_messages" USING btree ("id") WHERE "reviewer_messages"."status" = 'pending';
