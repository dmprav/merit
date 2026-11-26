CREATE TABLE "committee_decision_versions" (
	"case_id" text NOT NULL,
	"revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"amount_minor_units" numeric(30, 0) NOT NULL,
	"amount_currency" text DEFAULT 'EUR' NOT NULL,
	"conditions" text,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"decision_date" date NOT NULL,
	"change_explanation" text,
	"material_version" integer,
	"actor_user_id" text,
	"actor_name" text NOT NULL,
	"provenance_interface" text,
	"provenance_client_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committee_decision_versions_case_id_revision_pk" PRIMARY KEY("case_id","revision"),
	CONSTRAINT "committee_decision_version_positive" CHECK ("committee_decision_versions"."revision" > 0),
	CONSTRAINT "committee_decision_outcome_check" CHECK ("committee_decision_versions"."outcome" IN ('Fund', 'Fund with conditions', 'Defer', 'Decline')),
	CONSTRAINT "committee_decision_amount_check" CHECK ("committee_decision_versions"."amount_minor_units" >= 0 AND "committee_decision_versions"."amount_currency" = 'EUR' AND (("committee_decision_versions"."outcome" IN ('Defer', 'Decline') AND "committee_decision_versions"."amount_minor_units" = 0) OR ("committee_decision_versions"."outcome" IN ('Fund', 'Fund with conditions') AND "committee_decision_versions"."amount_minor_units" > 0))),
	CONSTRAINT "committee_decision_conditions_check" CHECK (("committee_decision_versions"."outcome" = 'Fund with conditions') = ("committee_decision_versions"."conditions" IS NOT NULL AND length(btrim("committee_decision_versions"."conditions")) > 0)),
	CONSTRAINT "committee_decision_reason_check" CHECK (length(btrim("committee_decision_versions"."reason")) > 0),
	CONSTRAINT "committee_decision_decided_by_check" CHECK (length(btrim("committee_decision_versions"."decided_by")) > 0),
	CONSTRAINT "committee_decision_explanation_check" CHECK (("committee_decision_versions"."revision" = 1) = ("committee_decision_versions"."change_explanation" IS NULL) AND ("committee_decision_versions"."change_explanation" IS NULL OR length(btrim("committee_decision_versions"."change_explanation")) > 0)),
	CONSTRAINT "committee_decision_provenance_check" CHECK (("committee_decision_versions"."provenance_interface" IS NULL AND "committee_decision_versions"."provenance_client_id" IS NULL) OR ("committee_decision_versions"."provenance_interface" = 'web' AND "committee_decision_versions"."provenance_client_id" IS NULL) OR ("committee_decision_versions"."provenance_interface" = 'mcp' AND "committee_decision_versions"."provenance_client_id" IS NOT NULL AND length("committee_decision_versions"."provenance_client_id") > 0))
);
--> statement-breakpoint
ALTER TABLE "committee_decision_versions" ADD CONSTRAINT "committee_decision_versions_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_decision_versions" ADD CONSTRAINT "committee_decision_versions_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_decision_versions" ADD CONSTRAINT "committee_decision_versions_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "committee_decision_versions_material_idx" ON "committee_decision_versions" USING btree ("case_id","material_version");--> statement-breakpoint
CREATE INDEX "committee_decision_versions_actor_user_idx" ON "committee_decision_versions" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE TRIGGER committee_decision_versions_immutable BEFORE UPDATE OR DELETE ON committee_decision_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
--> statement-breakpoint
ALTER TABLE committee_decision_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON committee_decision_versions FOR SELECT USING
  (EXISTS (SELECT 1 FROM application_cases parent WHERE parent.id = case_id));
CREATE POLICY workspace_write ON committee_decision_versions FOR ALL USING
  ((SELECT merit_scope()->>'kind') IN ('workspace', 'assignment')
   AND EXISTS (SELECT 1 FROM application_cases parent WHERE parent.id = case_id));
