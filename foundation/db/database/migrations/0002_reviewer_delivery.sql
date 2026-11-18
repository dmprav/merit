ALTER TABLE "reviewer_messages" ADD COLUMN "delivery_token" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
-- A sender obtains the token from the authorized outbox read before contacting the provider.
-- Membership can change during delivery. The receipt authorizes only that message's outcome.
CREATE FUNCTION public.merit_finish_reviewer_message(message_id uuid, token uuid, outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF outcome IS NULL OR outcome NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'Invalid reviewer delivery outcome';
  END IF;
  UPDATE public.reviewer_messages
    SET status = CASE WHEN status = 'sent' THEN 'sent' ELSE outcome END
    WHERE id = message_id AND delivery_token = token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reviewer delivery acknowledgement did not match a message';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.merit_finish_reviewer_message(uuid, uuid, text) FROM PUBLIC;
