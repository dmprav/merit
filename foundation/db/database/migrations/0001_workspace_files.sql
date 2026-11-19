CREATE TABLE "workspace_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"object_key" text GENERATED ALWAYS AS ('files/' || id::text) STORED NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_files_request_key" UNIQUE("organization_id","request_id"),
	CONSTRAINT "workspace_files_length_check" CHECK ("workspace_files"."byte_length" >= 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_uploaded_by_app_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "workspace_file_read" ON "workspace_files" AS PERMISSIVE FOR SELECT TO public USING ((SELECT merit_scope()->>'kind') = 'workspace'
  AND organization_id IN (SELECT merit_workspace_ids()));--> statement-breakpoint
CREATE POLICY "workspace_file_insert" ON "workspace_files" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((SELECT merit_scope()->>'kind') = 'workspace'
  AND organization_id IN (SELECT merit_workspace_ids())
    AND uploaded_by = (SELECT merit_scope()->>'userId'));