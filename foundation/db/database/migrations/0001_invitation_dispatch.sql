ALTER TABLE "organization_invitations" ADD COLUMN "dispatch_ciphertext" text;--> statement-breakpoint
CREATE INDEX "organization_invitations_dispatch_idx" ON "organization_invitations" USING btree ("id") WHERE "organization_invitations"."dispatch_ciphertext" IS NOT NULL;
--> statement-breakpoint
-- Terminal transitions, including replacement and loss of issuer access, erase the envelope
-- in the same transaction even when no worker is running.
CREATE FUNCTION merit_discard_invitation_dispatch() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  NEW.dispatch_ciphertext := NULL;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER discard_invitation_dispatch BEFORE UPDATE OF revoked_at, accepted_at, delivery
ON organization_invitations FOR EACH ROW
WHEN (NEW.dispatch_ciphertext IS NOT NULL AND
  (NEW.revoked_at IS NOT NULL OR NEW.accepted_at IS NOT NULL OR NEW.delivery <> 'pending'))
EXECUTE FUNCTION merit_discard_invitation_dispatch();
--> statement-breakpoint
-- Reconcile only sealed handoffs. A scan also discards bounded batches of obsolete handoffs,
-- including invitations that expired while all workers were offline.
CREATE FUNCTION merit_pending_invitation_dispatches(batch_size integer, after_id text)
RETURNS TABLE ("invitationId" text, ciphertext text)
LANGUAGE plpgsql STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE public.organization_invitations i SET dispatch_ciphertext = NULL
  WHERE i.id IN (
    SELECT stale.id FROM public.organization_invitations stale
    WHERE stale.dispatch_ciphertext IS NOT NULL AND stale.expires_at <= statement_timestamp()
    ORDER BY stale.id LIMIT greatest(0, least(batch_size, 100)) FOR UPDATE SKIP LOCKED
  );
  RETURN QUERY
    SELECT i.id, i.dispatch_ciphertext FROM public.organization_invitations i
    WHERE i.dispatch_ciphertext IS NOT NULL AND i.id > after_id AND i.delivery = 'pending'
      AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at > statement_timestamp()
    ORDER BY i.id LIMIT greatest(0, least(batch_size, 100));
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_pending_invitation_dispatches(integer, text) FROM PUBLIC;
--> statement-breakpoint
-- Acknowledging the handoff requires the matching token hash and can only erase the envelope.
CREATE FUNCTION merit_acknowledge_invitation_dispatch(invitation_id text, expected_hash text)
RETURNS void LANGUAGE sql STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE public.organization_invitations SET dispatch_ciphertext = NULL
  WHERE id IN (
    SELECT pending.id FROM public.organization_invitations pending
    WHERE pending.id = invitation_id AND pending.token_hash = expected_hash
      AND pending.dispatch_ciphertext IS NOT NULL FOR UPDATE SKIP LOCKED
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_acknowledge_invitation_dispatch(text, text) FROM PUBLIC;
