-- The final 60 bits of a v4 UUID contain only random bits (no version/variant bits).
CREATE FUNCTION merit_public_id() RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  bits bit(60) := ('x' || right(replace(gen_random_uuid()::text, '-', ''), 15))::bit(60);
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  result text := '';
BEGIN
  FOR i IN 0..11 LOOP
    result := result || substr(alphabet, substring(bits FROM i * 5 + 1 FOR 5)::integer + 1, 1);
  END LOOP;
  RETURN result;
END $$;
--> statement-breakpoint
CREATE TABLE "application_cases" (
	"id" text PRIMARY KEY DEFAULT merit_public_id() NOT NULL,
	"organization_id" text NOT NULL,
	"round_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"material_version" integer,
	"revision" integer DEFAULT 0 NOT NULL,
	"contact_id" uuid,
	"intake_status" text NOT NULL,
	"withdrawal" jsonb,
	"summary" text DEFAULT '' NOT NULL,
	"summary_author" jsonb,
	"attention" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "application_cases_owner_key" UNIQUE("organization_id","id"),
	CONSTRAINT "application_cases_round_position_key" UNIQUE("organization_id","round_id","position"),
	CONSTRAINT "application_cases_revisions_check" CHECK ("application_cases"."revision" >= 0),
	CONSTRAINT "application_cases_status_check" CHECK ("application_cases"."intake_status" IN ('in_preparation', 'ready'))
);
--> statement-breakpoint
CREATE TABLE "application_creation_receipts" (
	"organization_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	CONSTRAINT "application_creation_receipts_organization_id_request_id_pk" PRIMARY KEY("organization_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "material_drafts" (
	"case_id" text PRIMARY KEY NOT NULL,
	"base_material_version" integer NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"reason" text NOT NULL,
	"revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"case_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"change_kind" text NOT NULL,
	"source" jsonb NOT NULL,
	"reason" text,
	"recorded_by_user_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_versions_case_id_version_pk" PRIMARY KEY("case_id","version"),
	CONSTRAINT "material_version_positive" CHECK ("material_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text,
	"provenance" jsonb,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_revision" integer,
	"target_name" text,
	"round_id" text,
	"application_id" text,
	"assignment_id" text,
	"format_version" integer DEFAULT 1 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"affiliation" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contacts_owner_key" UNIQUE("organization_id","id"),
	CONSTRAINT "contacts_identity_check" CHECK ("contacts"."name" <> '' OR "contacts"."email" <> ''),
	CONSTRAINT "contacts_revision_check" CHECK ("contacts"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "grant_navigation_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"round_id" text,
	"application_id" text,
	"assignment_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "grant_navigation_pins_round" UNIQUE("user_id","round_id"),
	CONSTRAINT "grant_navigation_pins_application" UNIQUE("user_id","application_id"),
	CONSTRAINT "grant_navigation_pins_review" UNIQUE("user_id","assignment_id"),
	CONSTRAINT "grant_navigation_pins_target" CHECK (num_nonnulls("grant_navigation_pins"."round_id", "grant_navigation_pins"."application_id", "grant_navigation_pins"."assignment_id") = 1),
	CONSTRAINT "grant_navigation_pins_position" CHECK ("grant_navigation_pins"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "access_request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_requests" (
	"email" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "demo_entry_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"administration" text DEFAULT 'none' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "memberships_administration_check" CHECK ("memberships"."administration" IN ('none', 'administrator', 'owner')),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" IN ('member', 'program_manager', 'reviewer', 'committee_reader'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'standard' NOT NULL,
	"demo_expires_at" timestamp with time zone,
	"demo_seed_version" integer,
	CONSTRAINT "organizations_slug_key" UNIQUE("slug"),
	CONSTRAINT "organizations_demo_check" CHECK (("organizations"."kind" = 'standard' AND "organizations"."demo_expires_at" IS NULL AND "organizations"."demo_seed_version" IS NULL) OR ("organizations"."kind" = 'demo' AND "organizations"."demo_expires_at" IS NOT NULL AND "organizations"."demo_seed_version" IS NOT NULL AND "organizations"."demo_seed_version" > 0)),
	CONSTRAINT "organizations_slug_check" CHECK ("organizations"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("organizations"."slug") <= 80 AND "organizations"."slug" NOT IN ('sign-in', 'organizations'))
);
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text DEFAULT 'provisioning' NOT NULL,
	"administration" text DEFAULT 'owner' NOT NULL,
	"role" text DEFAULT 'program_manager' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"delivery" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "organization_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "organization_invitations_access_check" CHECK (("organization_invitations"."purpose" = 'provisioning' AND "organization_invitations"."administration" = 'owner' AND "organization_invitations"."role" = 'program_manager') OR ("organization_invitations"."purpose" = 'team' AND "organization_invitations"."administration" IN ('none', 'administrator') AND "organization_invitations"."role" IN ('member', 'program_manager', 'reviewer'))),
	CONSTRAINT "organization_invitations_delivery_check" CHECK ("organization_invitations"."delivery" IN ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "recommendation_versions" (
	"case_id" text NOT NULL,
	"revision" integer NOT NULL,
	"material_version" integer,
	"content" jsonb NOT NULL,
	"actor_user_id" text,
	"provenance" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_versions_case_id_revision_pk" PRIMARY KEY("case_id","revision"),
	CONSTRAINT "recommendation_version_positive" CHECK ("recommendation_versions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "review_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"request_id" text NOT NULL,
	"email" text NOT NULL,
	"reviewer_user_id" text,
	"membership_id" uuid NOT NULL,
	"manager_user_id" text NOT NULL,
	"manager_name" text NOT NULL,
	"manager_email" text NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'invited' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"assessment_id" text,
	"conflict" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_assignments_request_key" UNIQUE("case_id","request_id"),
	CONSTRAINT "review_assignment_status" CHECK ("review_assignments"."status" IN ('invited','accepted','submitted','conflict','cancelled','declined')),
	CONSTRAINT "review_assignment_revision" CHECK ("review_assignments"."revision" >= 0),
	CONSTRAINT "review_assignment_identity" CHECK ("review_assignments"."status" NOT IN ('accepted', 'submitted') OR ("review_assignments"."reviewer_user_id" IS NOT NULL AND "review_assignments"."accepted_at" IS NOT NULL)),
	CONSTRAINT "review_assignment_submission" CHECK ("review_assignments"."status" <> 'submitted' OR "review_assignments"."assessment_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "reviewer_command_receipts" (
	"assignment_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"result_revision" integer NOT NULL,
	CONSTRAINT "reviewer_receipts_command_key" UNIQUE("assignment_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "reviewer_drafts" (
	"assignment_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL,
	"last_command_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_draft_revision" CHECK ("reviewer_drafts"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reviewer_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_versions" (
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"version" integer NOT NULL,
	"material_version" integer,
	"criteria_round_id" text,
	"criteria_version" integer,
	"content" jsonb NOT NULL,
	"recorder" jsonb,
	"note" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_versions_case_id_assessment_id_version_pk" PRIMARY KEY("case_id","assessment_id","version")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"request_id" text,
	"previous_id" text,
	"author_user_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "assessments_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "assessments_request_key" UNIQUE("case_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"material_version" integer,
	"criteria_round_id" text,
	"criteria_version" integer,
	"status" text NOT NULL,
	"recorder" jsonb,
	"closed_by" jsonb,
	"position" integer NOT NULL,
	CONSTRAINT "review_requests_case_id_id_pk" PRIMARY KEY("case_id","id")
);
--> statement-breakpoint
CREATE TABLE "review_states" (
	"case_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "review_states_revision_check" CHECK ("review_states"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "criteria_versions" (
	"round_id" text NOT NULL,
	"version" integer NOT NULL,
	"criteria" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "criteria_versions_round_id_version_pk" PRIMARY KEY("round_id","version"),
	CONSTRAINT "criteria_version_positive" CHECK ("criteria_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "funding_rounds" (
	"id" text PRIMARY KEY DEFAULT merit_public_id() NOT NULL,
	"organization_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"manager_user_id" text,
	"manager_name" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"budget_established" boolean DEFAULT false NOT NULL,
	"budget" numeric(30, 0),
	"meeting_date" date,
	"snapshot_date" date NOT NULL,
	"decision_status" text NOT NULL,
	"criteria_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "funding_rounds_owner_key" UNIQUE("organization_id","id"),
	CONSTRAINT "funding_rounds_revision_check" CHECK ("funding_rounds"."revision" >= 0),
	CONSTRAINT "funding_rounds_budget_check" CHECK ("funding_rounds"."budget" >= 0)
);
--> statement-breakpoint
CREATE TABLE "round_creation_receipts" (
	"organization_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"round_id" text NOT NULL,
	CONSTRAINT "round_creation_receipts_organization_id_request_id_pk" PRIMARY KEY("organization_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text,
	"name" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "app_users_clerk_user_id_key" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_cases" ADD CONSTRAINT "application_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_cases" ADD CONSTRAINT "application_cases_organization_id_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_cases" ADD CONSTRAINT "application_cases_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_creation_receipts" ADD CONSTRAINT "application_creation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_drafts" ADD CONSTRAINT "material_drafts_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_drafts" ADD CONSTRAINT "material_drafts_case_id_base_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","base_material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_recorded_by_user_id_app_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_round_id_funding_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."funding_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_application_id_application_cases_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_app_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_app_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_app_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_versions" ADD CONSTRAINT "recommendation_versions_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_versions" ADD CONSTRAINT "recommendation_versions_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_versions" ADD CONSTRAINT "recommendation_versions_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reviewer_user_id_app_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_manager_user_id_app_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_case_id_request_id_review_requests_case_id_id_fk" FOREIGN KEY ("case_id","request_id") REFERENCES "public"."review_requests"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_case_id_assessment_id_assessments_case_id_id_fk" FOREIGN KEY ("case_id","assessment_id") REFERENCES "public"."assessments"("case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_command_receipts" ADD CONSTRAINT "reviewer_command_receipts_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_drafts" ADD CONSTRAINT "reviewer_drafts_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_messages" ADD CONSTRAINT "reviewer_messages_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_organization_id_criteria_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","criteria_round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_case_id_assessment_id_assessments_case_id_id_fk" FOREIGN KEY ("case_id","assessment_id") REFERENCES "public"."assessments"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_criteria_round_id_criteria_version_criteria_versions_round_id_version_fk" FOREIGN KEY ("criteria_round_id","criteria_version") REFERENCES "public"."criteria_versions"("round_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_author_user_id_app_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_case_id_request_id_review_requests_case_id_id_fk" FOREIGN KEY ("case_id","request_id") REFERENCES "public"."review_requests"("case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_criteria_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","criteria_round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_criteria_round_id_criteria_version_criteria_versions_round_id_version_fk" FOREIGN KEY ("criteria_round_id","criteria_version") REFERENCES "public"."criteria_versions"("round_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_states" ADD CONSTRAINT "review_states_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_round_id_funding_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."funding_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_manager_user_id_app_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_creation_receipts" ADD CONSTRAINT "round_creation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_time_idx" ON "audit_events" USING btree ("organization_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("organization_id","target_type","target_id","target_revision");--> statement-breakpoint
CREATE INDEX "audit_events_round_time_idx" ON "audit_events" USING btree ("organization_id","round_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_time_idx" ON "audit_events" USING btree ("organization_id","actor_user_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_assignment_idx" ON "audit_events" USING btree ("organization_id","assignment_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "access_request_limits_expiry_idx" ON "access_request_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "demo_entry_limits_expiry_idx" ON "demo_entry_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_owner_key" ON "memberships" USING btree ("organization_id") WHERE "memberships"."administration" = 'owner';--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_organization_idx" ON "organization_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_pending_key" ON "organization_invitations" USING btree ("organization_id","email") WHERE "organization_invitations"."revoked_at" IS NULL AND "organization_invitations"."accepted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_provisioning_key" ON "organization_invitations" USING btree ("organization_id") WHERE "organization_invitations"."purpose" = 'provisioning' AND "organization_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "review_assignments_reviewer" ON "review_assignments" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_assignments_email" ON "review_assignments" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reviewer_messages_assignment" ON "reviewer_messages" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "guest_sessions_expiry_idx" ON "guest_sessions" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE audit_events ADD CONSTRAINT audit_events_organization_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
--> statement-breakpoint
-- Current pointers are checked at commit so a root and its first version can be inserted together.
ALTER TABLE application_cases ADD CONSTRAINT application_cases_current_material_fk
  FOREIGN KEY (id, material_version) REFERENCES material_versions(case_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE funding_rounds ADD CONSTRAINT funding_rounds_current_criteria_fk
  FOREIGN KEY (id, criteria_version) REFERENCES criteria_versions(round_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE assessments ADD CONSTRAINT assessments_previous_fk
  FOREIGN KEY (case_id, previous_id) REFERENCES assessments(case_id, id);
ALTER TABLE material_versions ADD CONSTRAINT material_content_check CHECK (
  jsonb_typeof(content) = 'object' AND content->>'version' = version::text
  AND NOT content ?| ARRAY['reviews', 'managerRecommendation', 'summary', 'summaryAuthor', 'contactId', 'intakeStatus']);
ALTER TABLE review_requests ADD CONSTRAINT review_request_basis_pair_check CHECK (
  (criteria_round_id IS NULL) = (criteria_version IS NULL));
ALTER TABLE assessment_versions ADD CONSTRAINT assessment_basis_check CHECK (
  (criteria_round_id IS NULL) = (criteria_version IS NULL)
  AND (content->>'applicationVersion')::integer IS NOT DISTINCT FROM material_version
  AND (content->>'criteriaVersion')::integer IS NOT DISTINCT FROM criteria_version);
CREATE UNIQUE INDEX review_requests_outstanding_key ON review_requests(case_id, contact_id) WHERE status = 'outstanding';
--> statement-breakpoint
CREATE FUNCTION grantmaking_preserve_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'criteria_versions' THEN
      SELECT EXISTS (SELECT 1 FROM funding_rounds WHERE id = OLD.round_id) INTO owner_exists;
    ELSE
      SELECT EXISTS (SELECT 1 FROM application_cases WHERE id = OLD.case_id) INTO owner_exists;
    END IF;
    IF NOT owner_exists THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'Recorded grantmaking versions cannot be changed while their owner exists' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER material_versions_immutable BEFORE UPDATE OR DELETE ON material_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER criteria_versions_immutable BEFORE UPDATE OR DELETE ON criteria_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER assessment_versions_immutable BEFORE UPDATE OR DELETE ON assessment_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER recommendation_versions_immutable BEFORE UPDATE OR DELETE ON recommendation_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
--> statement-breakpoint
CREATE FUNCTION preserve_assessment_author() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.author_user_id IS DISTINCT FROM OLD.author_user_id THEN RAISE EXCEPTION 'Assessment authorship is immutable'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER assessments_author_immutable BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION preserve_assessment_author();
--> statement-breakpoint
CREATE FUNCTION audit_preserve_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM organizations
    WHERE id = OLD.organization_id AND kind = 'demo'
      AND demo_expires_at <= statement_timestamp()
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Recorded audit events cannot be changed; only expired demo cleanup may delete them'
    USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_preserve_event();
--> statement-breakpoint
CREATE INDEX "audit_events_subject_time_idx" ON "audit_events" USING btree ("organization_id","target_type","target_id","recorded_at","id");
