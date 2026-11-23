CREATE TABLE "assistant_consents" (
	"organization_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" text PRIMARY KEY DEFAULT merit_public_id() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"membership_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversations_revision_check" CHECK ("assistant_conversations"."revision" >= 0),
	CONSTRAINT "assistant_conversations_status_check" CHECK ("assistant_conversations"."status" IN ('idle', 'running', 'awaiting_approval', 'completed', 'stopped', 'failed', 'unavailable')),
	CONSTRAINT "assistant_conversations_state_check" CHECK (jsonb_typeof("assistant_conversations"."state") = 'object')
);
--> statement-breakpoint
ALTER TABLE "assistant_consents" ADD CONSTRAINT "assistant_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversations_owner_idx" ON "assistant_conversations" USING btree ("organization_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_idx" ON "assistant_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_conversations_running_idx" ON "assistant_conversations" USING btree ("id") WHERE "assistant_conversations"."status" = 'running';
--> statement-breakpoint
ALTER TABLE assistant_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_consent_read ON assistant_consents FOR SELECT USING (
  (SELECT merit_scope()->>'kind') = 'workspace' AND organization_id IN (SELECT merit_workspace_ids())
);
CREATE POLICY administrator_consent_write ON assistant_consents FOR ALL USING (
  (SELECT merit_scope()->>'kind') = 'workspace' AND organization_id IN (SELECT merit_workspace_ids())
  AND EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = assistant_consents.organization_id
    AND m.user_id = (SELECT merit_scope()->>'userId') AND m.administration IN ('administrator', 'owner'))
);
--> statement-breakpoint
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_conversation ON assistant_conversations USING (
  (SELECT merit_scope()->>'kind') = 'workspace' AND organization_id IN (SELECT merit_workspace_ids())
  AND user_id = (SELECT merit_scope()->>'userId')
  AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = assistant_conversations.membership_id
    AND m.organization_id = assistant_conversations.organization_id AND m.user_id = assistant_conversations.user_id)
);
--> statement-breakpoint
-- Workers discover only current addresses. Reading content, approving or dispatching
-- work always requires opening a new transaction scoped to the owner and workspace.
CREATE FUNCTION merit_running_assistant_conversations(batch_size integer, after_id text)
RETURNS TABLE ("userId" text, "workspaceSlug" text, id text, revision integer)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT c.user_id, o.slug, c.id, c.revision FROM public.assistant_conversations c
  JOIN public.assistant_consents consent ON consent.organization_id = c.organization_id
  JOIN public.organizations o ON o.id = c.organization_id
  JOIN public.memberships m ON m.id = c.membership_id AND m.user_id = c.user_id AND m.organization_id = c.organization_id
  JOIN public.app_users u ON u.id = c.user_id
  WHERE c.status = 'running' AND c.id > after_id AND u.active AND public.merit_workspace_active(o.kind, o.demo_expires_at)
  ORDER BY c.id LIMIT greatest(0, least(batch_size, 100))
$$;
REVOKE ALL ON FUNCTION merit_running_assistant_conversations(integer, text) FROM PUBLIC;
