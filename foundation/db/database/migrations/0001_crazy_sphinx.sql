CREATE TABLE "application_pdfs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"round_id" text NOT NULL,
	"case_id" text,
	"uploader_id" text NOT NULL,
	"filename" text NOT NULL,
	"object_key" text NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_at" timestamp with time zone,
	CONSTRAINT "application_pdfs_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "application_pdfs_filename_check" CHECK (length(btrim("application_pdfs"."filename")) BETWEEN 1 AND 255),
	CONSTRAINT "application_pdfs_size_check" CHECK ("application_pdfs"."byte_length" BETWEEN 1 AND 25000000),
	CONSTRAINT "application_pdfs_digest_check" CHECK ("application_pdfs"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "application_pdfs_attachment_check" CHECK ("application_pdfs"."attached_at" IS NULL OR "application_pdfs"."case_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "material_drafts" ADD COLUMN "pdfs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "material_versions" ADD COLUMN "pdfs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "application_pdfs" ADD CONSTRAINT "application_pdfs_uploader_id_app_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_pdfs" ADD CONSTRAINT "application_pdfs_organization_id_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_pdfs" ADD CONSTRAINT "application_pdfs_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_pdfs_round_idx" ON "application_pdfs" USING btree ("organization_id","round_id");--> statement-breakpoint
CREATE INDEX "application_pdfs_case_idx" ON "application_pdfs" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "application_pdfs_uploader_idx" ON "application_pdfs" USING btree ("uploader_id");--> statement-breakpoint
ALTER TABLE "material_drafts" ADD CONSTRAINT "material_drafts_pdfs_check" CHECK (jsonb_typeof("material_drafts"."pdfs") = 'array' AND jsonb_array_length("material_drafts"."pdfs") <= 5);--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_pdfs_check" CHECK (jsonb_typeof("material_versions"."pdfs") = 'array' AND jsonb_array_length("material_versions"."pdfs") <= 5);
--> statement-breakpoint
ALTER TABLE application_pdfs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_read ON application_pdfs FOR SELECT USING
  (organization_id IN (SELECT merit_workspace_ids()));
--> statement-breakpoint
CREATE POLICY workspace_write ON application_pdfs FOR ALL USING
  ((SELECT merit_scope()->>'kind') = 'workspace' AND organization_id IN (SELECT merit_workspace_ids()));
