-- Reconciliation discovers committed reviewer messages that still await delivery across
-- workspaces. It returns identifiers only, for the newest message of each kind per assignment
-- and only while delivery could still proceed. Reading, sending and recording an outcome
-- always open a new transaction scoped to the returned user and assignment.
CREATE FUNCTION merit_pending_reviewer_messages(batch_size integer, after_id uuid)
RETURNS TABLE ("messageId" uuid, "assignmentId" uuid, kind text, "userId" text)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.id, m.assignment_id, m.kind,
    CASE WHEN m.kind = 'submission' THEN coalesce(a.reviewer_user_id, a.manager_user_id)
      ELSE a.manager_user_id END
  FROM public.reviewer_messages m
  JOIN public.review_assignments a ON a.id = m.assignment_id
  WHERE m.status = 'pending' AND m.id > after_id
    AND NOT EXISTS (
      SELECT 1 FROM public.reviewer_messages newer
      WHERE newer.assignment_id = m.assignment_id AND newer.kind = m.kind
        AND (newer.created_at, newer.id) > (m.created_at, m.id))
    AND (m.kind = 'submission' OR (a.status = 'invited' AND a.expires_at > clock_timestamp()))
  ORDER BY m.id LIMIT greatest(0, least(batch_size, 100))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_pending_reviewer_messages(integer, uuid) FROM PUBLIC;
