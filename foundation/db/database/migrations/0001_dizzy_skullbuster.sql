CREATE TABLE "source_document_citations" (
	"id" text PRIMARY KEY DEFAULT merit_public_id() NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"role" text NOT NULL,
	"version" integer NOT NULL,
	"page" integer NOT NULL,
	"note" text,
	"recorder_user_id" text NOT NULL,
	"recorder_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_document_citations_role_check" CHECK ("source_document_citations"."role" in ('proposal', 'budget')),
	CONSTRAINT "source_document_citations_version_check" CHECK ("source_document_citations"."version" > 0),
	CONSTRAINT "source_document_citations_page_check" CHECK ("source_document_citations"."page" > 0),
	CONSTRAINT "source_document_citations_note_check" CHECK ("source_document_citations"."note" is null or char_length("source_document_citations"."note") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "source_document_versions" (
	"case_id" text NOT NULL,
	"role" text NOT NULL,
	"version" integer NOT NULL,
	"filename" text NOT NULL,
	"page_count" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"recorder_user_id" text NOT NULL,
	"recorder_name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_document_versions_case_id_role_version_pk" PRIMARY KEY("case_id","role","version"),
	CONSTRAINT "source_document_versions_role_check" CHECK ("source_document_versions"."role" in ('proposal', 'budget')),
	CONSTRAINT "source_document_versions_version_check" CHECK ("source_document_versions"."version" > 0),
	CONSTRAINT "source_document_versions_pages_check" CHECK ("source_document_versions"."page_count" > 0),
	CONSTRAINT "source_document_versions_bytes_check" CHECK ("source_document_versions"."byte_size" between 1 and 20971520 and octet_length("source_document_versions"."content") = "source_document_versions"."byte_size"),
	CONSTRAINT "source_document_versions_filename_check" CHECK (char_length("source_document_versions"."filename") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"case_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"current_version" integer NOT NULL,
	CONSTRAINT "source_documents_case_id_role_pk" PRIMARY KEY("case_id","role"),
	CONSTRAINT "source_documents_role_check" CHECK ("source_documents"."role" in ('proposal', 'budget')),
	CONSTRAINT "source_documents_current_version_check" CHECK ("source_documents"."current_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "source_document_citations" ADD CONSTRAINT "source_document_citations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_citations" ADD CONSTRAINT "source_document_citations_recorder_user_id_app_users_id_fk" FOREIGN KEY ("recorder_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_citations" ADD CONSTRAINT "source_document_citations_case_id_role_version_source_document_versions_case_id_role_version_fk" FOREIGN KEY ("case_id","role","version") REFERENCES "public"."source_document_versions"("case_id","role","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_versions" ADD CONSTRAINT "source_document_versions_recorder_user_id_app_users_id_fk" FOREIGN KEY ("recorder_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_versions" ADD CONSTRAINT "source_document_versions_case_id_role_source_documents_case_id_role_fk" FOREIGN KEY ("case_id","role") REFERENCES "public"."source_documents"("case_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_document_citations_case_role_recorded_idx" ON "source_document_citations" USING btree ("case_id","role","recorded_at");