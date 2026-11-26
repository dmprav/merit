-- A manager retrying a failed reviewer message puts it back to pending with a fresh delivery
-- token, so the delivery workflow's outcome is guarded by the new token. Only a failed message in
-- a workspace the current member can access is reset, and the message keeps its ID.
CREATE FUNCTION merit_retry_reviewer_message(message_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH reset AS (
    UPDATE public.reviewer_messages m
      SET status = 'pending', delivery_token = gen_random_uuid()
      WHERE m.id = message_id AND m.status = 'failed'
        AND (public.merit_scope()->>'kind') = 'workspace'
        AND EXISTS (
          SELECT 1 FROM public.review_assignments a
          WHERE a.id = m.assignment_id AND a.organization_id IN (SELECT public.merit_workspace_ids()))
      RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM reset)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_retry_reviewer_message(uuid) FROM PUBLIC;
