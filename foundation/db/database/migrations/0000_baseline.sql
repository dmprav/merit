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
	"round_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"material_version" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"contact_id" uuid,
	"intake_status" text NOT NULL,
	"withdrawn_on" date,
	"withdrawal_reason" text,
	"withdrawal_recorder_user_id" text,
	"withdrawal_recorder_name" text,
	"withdrawal_recorded_at" timestamp with time zone,
	"search_title" text DEFAULT '' NOT NULL,
	"search_applicant" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"summary_author_user_id" text,
	"summary_author_name" text,
	"summary_recorded_at" timestamp with time zone,
	"attention" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "application_cases_owner_key" UNIQUE("organization_id","id"),
	CONSTRAINT "application_cases_round_position_key" UNIQUE("organization_id","round_id","position"),
	CONSTRAINT "application_cases_position_check" CHECK ("application_cases"."position" >= 0),
	CONSTRAINT "application_cases_material_version_check" CHECK ("application_cases"."material_version" > 0),
	CONSTRAINT "application_cases_revisions_check" CHECK ("application_cases"."revision" >= 0),
	CONSTRAINT "application_cases_status_check" CHECK ("application_cases"."intake_status" IN ('in_preparation', 'ready')),
	CONSTRAINT "application_cases_withdrawal_check" CHECK (("application_cases"."withdrawn_on" IS NULL AND "application_cases"."withdrawal_reason" IS NULL AND "application_cases"."withdrawal_recorder_user_id" IS NULL AND "application_cases"."withdrawal_recorder_name" IS NULL AND "application_cases"."withdrawal_recorded_at" IS NULL) OR ("application_cases"."withdrawn_on" IS NOT NULL AND "application_cases"."withdrawal_reason" IS NOT NULL AND "application_cases"."withdrawal_recorder_user_id" IS NOT NULL AND "application_cases"."withdrawal_recorder_name" IS NOT NULL AND "application_cases"."withdrawal_recorded_at" IS NOT NULL)),
	CONSTRAINT "application_cases_summary_author_check" CHECK (("application_cases"."summary_author_user_id" IS NULL AND "application_cases"."summary_author_name" IS NULL AND "application_cases"."summary_recorded_at" IS NULL) OR ("application_cases"."summary_author_user_id" IS NOT NULL AND "application_cases"."summary_author_name" IS NOT NULL AND "application_cases"."summary_recorded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "application_creation_receipts" (
	"organization_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	CONSTRAINT "application_creation_receipts_organization_id_request_id_pk" PRIMARY KEY("organization_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "material_draft_answers" (
	"case_id" text NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"question" text NOT NULL,
	"response" text NOT NULL,
	CONSTRAINT "material_draft_answers_case_id_position_pk" PRIMARY KEY("case_id","position"),
	CONSTRAINT "material_draft_answers_question_key" UNIQUE("case_id","question_id"),
	CONSTRAINT "material_draft_answers_position_check" CHECK ("material_draft_answers"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_drafts" (
	"case_id" text PRIMARY KEY NOT NULL,
	"base_material_version" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"applicant" text NOT NULL,
	"project_period" text,
	"requested" text NOT NULL,
	"reason" text NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "material_drafts_base_material_version_check" CHECK ("material_drafts"."base_material_version" > 0),
	CONSTRAINT "material_drafts_kind_check" CHECK ("material_drafts"."kind" IN ('correction', 'revision')),
	CONSTRAINT "material_drafts_revision_check" CHECK ("material_drafts"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_version_answers" (
	"case_id" text NOT NULL,
	"material_version" integer NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"question" text NOT NULL,
	"response" text NOT NULL,
	CONSTRAINT "material_version_answers_case_id_material_version_position_pk" PRIMARY KEY("case_id","material_version","position"),
	CONSTRAINT "material_version_answers_question_key" UNIQUE("case_id","material_version","question_id"),
	CONSTRAINT "material_version_answers_position_check" CHECK ("material_version_answers"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "material_version_evidence" (
	"case_id" text NOT NULL,
	"material_version" integer NOT NULL,
	"position" integer NOT NULL,
	"evidence_version" integer NOT NULL,
	"passage" text NOT NULL,
	CONSTRAINT "material_version_evidence_case_id_material_version_position_pk" PRIMARY KEY("case_id","material_version","position"),
	CONSTRAINT "material_version_evidence_position_check" CHECK ("material_version_evidence"."position" >= 0),
	CONSTRAINT "material_version_evidence_version_check" CHECK ("material_version_evidence"."evidence_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_versions" (
	"case_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"requested_minor_units" numeric(30, 0),
	"requested_currency" text,
	"submission_version" integer,
	"applicant_organization" text,
	"submitted_on" date,
	"project_period" text,
	"change_kind" text NOT NULL,
	"source_kind" text DEFAULT 'recorded_external' NOT NULL,
	"reason" text,
	"recorded_by_user_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_versions_case_id_version_pk" PRIMARY KEY("case_id","version"),
	CONSTRAINT "material_version_positive" CHECK ("material_versions"."version" > 0),
	CONSTRAINT "material_requested_check" CHECK (("material_versions"."requested_minor_units" IS NULL) = ("material_versions"."requested_currency" IS NULL) AND ("material_versions"."requested_minor_units" IS NULL OR ("material_versions"."requested_minor_units" >= 0 AND "material_versions"."requested_currency" = 'EUR'))),
	CONSTRAINT "material_submission_check" CHECK (("material_versions"."submission_version" IS NULL AND "material_versions"."applicant_organization" IS NULL AND "material_versions"."submitted_on" IS NULL AND "material_versions"."project_period" IS NULL) OR ("material_versions"."submission_version" IS NOT NULL AND "material_versions"."submission_version" > 0)),
	CONSTRAINT "material_versions_change_kind_check" CHECK ("material_versions"."change_kind" IN ('initial', 'recorded', 'save_content', 'correction', 'revision')),
	CONSTRAINT "material_source_kind_check" CHECK ("material_versions"."source_kind" IN ('recorded_external', 'fictional_example'))
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
	"case_id" text,
	"assignment_id" text,
	"format_version" integer DEFAULT 1 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_format_version_check" CHECK ("audit_events"."format_version" > 0)
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
	"case_id" text,
	"assignment_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "grant_navigation_pins_round" UNIQUE("user_id","round_id"),
	CONSTRAINT "grant_navigation_pins_application" UNIQUE("user_id","case_id"),
	CONSTRAINT "grant_navigation_pins_review" UNIQUE("user_id","assignment_id"),
	CONSTRAINT "grant_navigation_pins_target" CHECK (num_nonnulls("grant_navigation_pins"."round_id", "grant_navigation_pins"."case_id", "grant_navigation_pins"."assignment_id") = 1),
	CONSTRAINT "grant_navigation_pins_position" CHECK ("grant_navigation_pins"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "access_request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "access_request_limits_attempts_check" CHECK ("access_request_limits"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	CONSTRAINT "access_requests_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "demo_entry_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "demo_entry_limits_attempts_check" CHECK ("demo_entry_limits"."attempts" > 0)
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
	CONSTRAINT "memberships_id_key" UNIQUE("id"),
	CONSTRAINT "memberships_administration_check" CHECK ("memberships"."administration" IN ('none', 'administrator', 'owner')),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" IN ('member', 'program_manager', 'reviewer', 'committee_reader')),
	CONSTRAINT "memberships_version_check" CHECK ("memberships"."version" >= 0)
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
	"dispatch_ciphertext" text,
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
	"recorded_date" date,
	"position" text NOT NULL,
	"allocation_minor_units" numeric(30, 0) NOT NULL,
	"allocation_currency" text DEFAULT 'EUR' NOT NULL,
	"reasoning" text NOT NULL,
	"author_user_id" text,
	"author_name" text,
	"author_provenance_interface" text,
	"author_provenance_client_id" text,
	"actor_user_id" text,
	"provenance_interface" text,
	"provenance_client_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_versions_case_id_revision_pk" PRIMARY KEY("case_id","revision"),
	CONSTRAINT "recommendation_version_positive" CHECK ("recommendation_versions"."revision" > 0),
	CONSTRAINT "recommendation_position_check" CHECK ("recommendation_versions"."position" IN ('Fund', 'Fund with a condition', 'Defer')),
	CONSTRAINT "recommendation_allocation_check" CHECK ("recommendation_versions"."allocation_minor_units" >= 0 AND "recommendation_versions"."allocation_currency" = 'EUR' AND (("recommendation_versions"."position" = 'Defer' AND "recommendation_versions"."allocation_minor_units" = 0) OR ("recommendation_versions"."position" IN ('Fund', 'Fund with a condition') AND "recommendation_versions"."allocation_minor_units" > 0))),
	CONSTRAINT "recommendation_reasoning_check" CHECK (length(btrim("recommendation_versions"."reasoning")) > 0),
	CONSTRAINT "recommendation_recorded_check" CHECK (("recommendation_versions"."recorded_date" IS NULL) = ("recommendation_versions"."material_version" IS NULL)),
	CONSTRAINT "recommendation_author_check" CHECK ("recommendation_versions"."author_name" IS NOT NULL OR ("recommendation_versions"."author_user_id" IS NULL AND "recommendation_versions"."author_provenance_interface" IS NULL AND "recommendation_versions"."author_provenance_client_id" IS NULL)),
	CONSTRAINT "recommendation_author_provenance_check" CHECK (("recommendation_versions"."author_provenance_interface" IS NULL AND "recommendation_versions"."author_provenance_client_id" IS NULL) OR ("recommendation_versions"."author_provenance_interface" = 'web' AND "recommendation_versions"."author_provenance_client_id" IS NULL) OR ("recommendation_versions"."author_provenance_interface" = 'mcp' AND "recommendation_versions"."author_provenance_client_id" IS NOT NULL AND length("recommendation_versions"."author_provenance_client_id") > 0)),
	CONSTRAINT "recommendation_provenance_check" CHECK (("recommendation_versions"."provenance_interface" IS NULL AND "recommendation_versions"."provenance_client_id" IS NULL) OR ("recommendation_versions"."provenance_interface" = 'web' AND "recommendation_versions"."provenance_client_id" IS NULL) OR ("recommendation_versions"."provenance_interface" = 'mcp' AND "recommendation_versions"."provenance_client_id" IS NOT NULL AND length("recommendation_versions"."provenance_client_id") > 0))
);
--> statement-breakpoint
CREATE TABLE "review_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"request_id" uuid NOT NULL,
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
	"assessment_id" uuid,
	"conflict" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_assignments_request_key" UNIQUE("case_id","request_id"),
	CONSTRAINT "review_assignment_status" CHECK ("review_assignments"."status" IN ('invited', 'accepted', 'submitted', 'conflict', 'cancelled', 'declined')),
	CONSTRAINT "review_assignment_revision" CHECK ("review_assignments"."revision" >= 0),
	CONSTRAINT "review_assignment_identity" CHECK ("review_assignments"."status" NOT IN ('accepted', 'submitted') OR ("review_assignments"."reviewer_user_id" IS NOT NULL AND "review_assignments"."accepted_at" IS NOT NULL)),
	CONSTRAINT "review_assignment_submission" CHECK ("review_assignments"."status" <> 'submitted' OR "review_assignments"."assessment_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "reviewer_command_receipts" (
	"assignment_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"result_revision" integer NOT NULL,
	CONSTRAINT "reviewer_command_receipts_assignment_id_command_id_pk" PRIMARY KEY("assignment_id","command_id"),
	CONSTRAINT "reviewer_command_receipts_revision_check" CHECK ("reviewer_command_receipts"."result_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reviewer_draft_observations" (
	"assignment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"criterion_id" uuid,
	"criterion" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "reviewer_draft_observations_assignment_id_position_pk" PRIMARY KEY("assignment_id","position"),
	CONSTRAINT "reviewer_draft_observations_position_check" CHECK ("reviewer_draft_observations"."position" >= 0),
	CONSTRAINT "reviewer_draft_observations_criterion_check" CHECK (length("reviewer_draft_observations"."criterion") <= 200),
	CONSTRAINT "reviewer_draft_observations_text_check" CHECK (length("reviewer_draft_observations"."text") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "reviewer_drafts" (
	"assignment_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"position" text,
	"amount" text,
	"reasoning" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"last_command_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_draft_revision" CHECK ("reviewer_drafts"."revision" >= 0),
	CONSTRAINT "reviewer_draft_position_check" CHECK ("reviewer_drafts"."position" is null or "reviewer_drafts"."position" in ('Fund', 'Fund with a condition', 'Defer', 'Decline')),
	CONSTRAINT "reviewer_draft_amount_check" CHECK ("reviewer_drafts"."amount" is null or length("reviewer_drafts"."amount") <= 32),
	CONSTRAINT "reviewer_draft_reasoning_check" CHECK (length("reviewer_drafts"."reasoning") <= 20000),
	CONSTRAINT "reviewer_draft_note_check" CHECK (length("reviewer_drafts"."note") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "reviewer_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_messages_kind_check" CHECK ("reviewer_messages"."kind" IN ('invitation', 'submission')),
	CONSTRAINT "reviewer_messages_status_check" CHECK ("reviewer_messages"."status" IN ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "assessment_version_observations" (
	"case_id" text NOT NULL,
	"assessment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"position" integer NOT NULL,
	"criterion_id" uuid,
	"criterion" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "assessment_version_observations_case_id_assessment_id_version_position_pk" PRIMARY KEY("case_id","assessment_id","version","position"),
	CONSTRAINT "assessment_version_observations_version_check" CHECK ("assessment_version_observations"."version" > 0),
	CONSTRAINT "assessment_version_observations_position_check" CHECK ("assessment_version_observations"."position" >= 0),
	CONSTRAINT "assessment_version_observations_criterion_check" CHECK (length("assessment_version_observations"."criterion") <= 200),
	CONSTRAINT "assessment_version_observations_text_check" CHECK (length("assessment_version_observations"."text") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "assessment_versions" (
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"assessment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"material_version" integer,
	"criteria_round_id" text,
	"criteria_version" integer,
	"assessed_on" date,
	"position" text,
	"amount_minor_units" numeric(30, 0),
	"amount_currency" text,
	"reasoning" text NOT NULL,
	"recorder_user_id" text,
	"recorder_name" text,
	"recorder_recorded_at" timestamp with time zone,
	"recorder_provenance_interface" text,
	"recorder_provenance_client_id" text,
	"note" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_versions_case_id_assessment_id_version_pk" PRIMARY KEY("case_id","assessment_id","version"),
	CONSTRAINT "assessment_versions_version_check" CHECK ("assessment_versions"."version" > 0),
	CONSTRAINT "assessment_versions_criteria_pair_check" CHECK (("assessment_versions"."criteria_round_id" is null) = ("assessment_versions"."criteria_version" is null)),
	CONSTRAINT "assessment_versions_position_check" CHECK ("assessment_versions"."position" is null or "assessment_versions"."position" in ('Fund', 'Fund with a condition', 'Defer', 'Decline')),
	CONSTRAINT "assessment_versions_amount_check" CHECK (("assessment_versions"."amount_minor_units" is null) = ("assessment_versions"."amount_currency" is null) and ("assessment_versions"."amount_minor_units" is null or ("assessment_versions"."amount_minor_units" >= 0 and "assessment_versions"."amount_minor_units" <> 'NaN' and "assessment_versions"."amount_currency" = 'EUR'))),
	CONSTRAINT "assessment_versions_position_amount_check" CHECK ("assessment_versions"."position" is null or "assessment_versions"."amount_minor_units" is null or ("assessment_versions"."position" in ('Decline', 'Defer')) = ("assessment_versions"."amount_minor_units" = 0)),
	CONSTRAINT "assessment_versions_reasoning_check" CHECK (length(btrim("assessment_versions"."reasoning")) > 0 and length("assessment_versions"."reasoning") <= 20000),
	CONSTRAINT "assessment_versions_note_check" CHECK (length("assessment_versions"."note") <= 2000),
	CONSTRAINT "assessment_versions_recorder_check" CHECK ((("assessment_versions"."recorder_user_id" is null) = ("assessment_versions"."recorder_name" is null)) and (("assessment_versions"."recorder_user_id" is null) = ("assessment_versions"."recorder_recorded_at" is null))),
	CONSTRAINT "assessment_versions_recorder_provenance_check" CHECK (("assessment_versions"."recorder_provenance_interface" is null and "assessment_versions"."recorder_provenance_client_id" is null) or ("assessment_versions"."recorder_user_id" is not null and (("assessment_versions"."recorder_provenance_interface" = 'web' and "assessment_versions"."recorder_provenance_client_id" is null) or ("assessment_versions"."recorder_provenance_interface" = 'mcp' and "assessment_versions"."recorder_provenance_client_id" is not null and length(btrim("assessment_versions"."recorder_provenance_client_id")) > 0))))
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"request_id" uuid,
	"previous_id" uuid,
	"author_user_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "assessments_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "assessments_request_key" UNIQUE("case_id","request_id"),
	CONSTRAINT "assessments_position_check" CHECK ("assessments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"material_version" integer NOT NULL,
	"criteria_round_id" text NOT NULL,
	"criteria_version" integer NOT NULL,
	"status" text NOT NULL,
	"recorder_user_id" text,
	"recorder_name" text,
	"recorder_recorded_at" timestamp with time zone,
	"recorder_provenance_interface" text,
	"recorder_provenance_client_id" text,
	"closed_by_user_id" text,
	"closed_by_name" text,
	"closed_by_recorded_at" timestamp with time zone,
	"closed_by_provenance_interface" text,
	"closed_by_provenance_client_id" text,
	"closed_cause" text,
	"position" integer NOT NULL,
	CONSTRAINT "review_requests_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "review_requests_status_check" CHECK ("review_requests"."status" IN ('outstanding', 'received', 'cancelled')),
	CONSTRAINT "review_requests_position_check" CHECK ("review_requests"."position" >= 0),
	CONSTRAINT "review_requests_recorder_check" CHECK ((("review_requests"."recorder_user_id" is null) = ("review_requests"."recorder_name" is null)) and (("review_requests"."recorder_user_id" is null) = ("review_requests"."recorder_recorded_at" is null))),
	CONSTRAINT "review_requests_recorder_provenance_check" CHECK (("review_requests"."recorder_provenance_interface" is null and "review_requests"."recorder_provenance_client_id" is null) or ("review_requests"."recorder_user_id" is not null and (("review_requests"."recorder_provenance_interface" = 'web' and "review_requests"."recorder_provenance_client_id" is null) or ("review_requests"."recorder_provenance_interface" = 'mcp' and "review_requests"."recorder_provenance_client_id" is not null and length(btrim("review_requests"."recorder_provenance_client_id")) > 0)))),
	CONSTRAINT "review_requests_closed_by_check" CHECK ((("review_requests"."closed_by_user_id" is null) = ("review_requests"."closed_by_name" is null)) and (("review_requests"."closed_by_user_id" is null) = ("review_requests"."closed_by_recorded_at" is null))),
	CONSTRAINT "review_requests_closed_by_provenance_check" CHECK (("review_requests"."closed_by_provenance_interface" is null and "review_requests"."closed_by_provenance_client_id" is null) or ("review_requests"."closed_by_user_id" is not null and (("review_requests"."closed_by_provenance_interface" = 'web' and "review_requests"."closed_by_provenance_client_id" is null) or ("review_requests"."closed_by_provenance_interface" = 'mcp' and "review_requests"."closed_by_provenance_client_id" is not null and length(btrim("review_requests"."closed_by_provenance_client_id")) > 0)))),
	CONSTRAINT "review_requests_closed_cause_check" CHECK ("review_requests"."closed_cause" is null or ("review_requests"."closed_by_user_id" is not null and "review_requests"."closed_cause" = 'application_withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "review_states" (
	"case_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "review_states_revision_check" CHECK ("review_states"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "criteria_version_items" (
	"round_id" text NOT NULL,
	"version" integer NOT NULL,
	"position" integer NOT NULL,
	"criterion_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "criteria_version_items_round_id_version_position_pk" PRIMARY KEY("round_id","version","position"),
	CONSTRAINT "criteria_version_items_criterion_key" UNIQUE("round_id","version","criterion_id"),
	CONSTRAINT "criteria_version_items_position_check" CHECK ("criteria_version_items"."position" >= 0),
	CONSTRAINT "criteria_version_items_title_check" CHECK (length(btrim("criteria_version_items"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "criteria_versions" (
	"round_id" text NOT NULL,
	"version" integer NOT NULL,
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
	"budget_minor_units" numeric(30, 0),
	"meeting_date" date,
	"snapshot_date" date NOT NULL,
	"decision_status" text NOT NULL,
	"criteria_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "funding_rounds_owner_key" UNIQUE("organization_id","id"),
	CONSTRAINT "funding_rounds_revision_check" CHECK ("funding_rounds"."revision" >= 0),
	CONSTRAINT "funding_rounds_currency_check" CHECK ("funding_rounds"."currency" = 'EUR'),
	CONSTRAINT "funding_rounds_budget_check" CHECK ("funding_rounds"."budget_minor_units" >= 0),
	CONSTRAINT "funding_rounds_decision_status_check" CHECK (length(btrim("funding_rounds"."decision_status")) > 0),
	CONSTRAINT "funding_rounds_criteria_version_check" CHECK ("funding_rounds"."criteria_version" > 0)
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
ALTER TABLE "material_draft_answers" ADD CONSTRAINT "material_draft_answers_case_id_material_drafts_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."material_drafts"("case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_drafts" ADD CONSTRAINT "material_drafts_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_drafts" ADD CONSTRAINT "material_drafts_case_id_base_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","base_material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_version_answers" ADD CONSTRAINT "material_version_answers_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_version_evidence" ADD CONSTRAINT "material_version_evidence_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_recorded_by_user_id_app_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_round_id_funding_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."funding_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_navigation_pins" ADD CONSTRAINT "grant_navigation_pins_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "reviewer_draft_observations" ADD CONSTRAINT "reviewer_draft_observations_assignment_id_reviewer_drafts_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."reviewer_drafts"("assignment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_drafts" ADD CONSTRAINT "reviewer_drafts_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_messages" ADD CONSTRAINT "reviewer_messages_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_version_observations" ADD CONSTRAINT "assessment_version_observations_case_id_assessment_id_version_assessment_versions_case_id_assessment_id_version_fk" FOREIGN KEY ("case_id","assessment_id","version") REFERENCES "public"."assessment_versions"("case_id","assessment_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_organization_id_criteria_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","criteria_round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_case_id_assessment_id_assessments_case_id_id_fk" FOREIGN KEY ("case_id","assessment_id") REFERENCES "public"."assessments"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_criteria_round_id_criteria_version_criteria_versions_round_id_version_fk" FOREIGN KEY ("criteria_round_id","criteria_version") REFERENCES "public"."criteria_versions"("round_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_author_user_id_app_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_case_id_request_id_review_requests_case_id_id_fk" FOREIGN KEY ("case_id","request_id") REFERENCES "public"."review_requests"("case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_criteria_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","criteria_round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_case_id_material_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","material_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_criteria_round_id_criteria_version_criteria_versions_round_id_version_fk" FOREIGN KEY ("criteria_round_id","criteria_version") REFERENCES "public"."criteria_versions"("round_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_states" ADD CONSTRAINT "review_states_case_id_application_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."application_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria_version_items" ADD CONSTRAINT "criteria_version_items_round_id_version_criteria_versions_round_id_version_fk" FOREIGN KEY ("round_id","version") REFERENCES "public"."criteria_versions"("round_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria_versions" ADD CONSTRAINT "criteria_versions_round_id_funding_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."funding_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_manager_user_id_app_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_creation_receipts" ADD CONSTRAINT "round_creation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_cases_contact_idx" ON "application_cases" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "application_cases_current_material_idx" ON "application_cases" USING btree ("id","material_version");--> statement-breakpoint
CREATE INDEX "material_drafts_base_material_idx" ON "material_drafts" USING btree ("case_id","base_material_version");--> statement-breakpoint
CREATE INDEX "material_versions_recorded_by_idx" ON "material_versions" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_time_idx" ON "audit_events" USING btree ("organization_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("organization_id","target_type","target_id","target_revision");--> statement-breakpoint
CREATE INDEX "audit_events_subject_time_idx" ON "audit_events" USING btree ("organization_id","target_type","target_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_round_time_idx" ON "audit_events" USING btree ("organization_id","round_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_time_idx" ON "audit_events" USING btree ("organization_id","actor_user_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_assignment_idx" ON "audit_events" USING btree ("organization_id","assignment_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "grant_navigation_pins_round_idx" ON "grant_navigation_pins" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "grant_navigation_pins_case_idx" ON "grant_navigation_pins" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "grant_navigation_pins_assignment_idx" ON "grant_navigation_pins" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "access_request_limits_expiry_idx" ON "access_request_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "access_requests_reviewed_by_idx" ON "access_requests" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "demo_entry_limits_expiry_idx" ON "demo_entry_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_owner_key" ON "memberships" USING btree ("organization_id") WHERE "memberships"."administration" = 'owner';--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_dispatch_idx" ON "organization_invitations" USING btree ("id") WHERE "organization_invitations"."dispatch_ciphertext" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "organization_invitations_organization_idx" ON "organization_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_invited_by_idx" ON "organization_invitations" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "organization_invitations_accepted_by_idx" ON "organization_invitations" USING btree ("accepted_by");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_pending_key" ON "organization_invitations" USING btree ("organization_id","email") WHERE "organization_invitations"."revoked_at" IS NULL AND "organization_invitations"."accepted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_provisioning_key" ON "organization_invitations" USING btree ("organization_id") WHERE "organization_invitations"."purpose" = 'provisioning' AND "organization_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "recommendation_versions_material_idx" ON "recommendation_versions" USING btree ("case_id","material_version");--> statement-breakpoint
CREATE INDEX "recommendation_versions_actor_user_idx" ON "recommendation_versions" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "review_assignments_case_idx" ON "review_assignments" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "review_assignments_manager_idx" ON "review_assignments" USING btree ("manager_user_id");--> statement-breakpoint
CREATE INDEX "review_assignments_assessment_idx" ON "review_assignments" USING btree ("case_id","assessment_id");--> statement-breakpoint
CREATE INDEX "review_assignments_reviewer" ON "review_assignments" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_assignments_email" ON "review_assignments" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reviewer_messages_assignment" ON "reviewer_messages" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "assessment_versions_case_idx" ON "assessment_versions" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "assessment_versions_round_idx" ON "assessment_versions" USING btree ("organization_id","criteria_round_id");--> statement-breakpoint
CREATE INDEX "assessment_versions_material_idx" ON "assessment_versions" USING btree ("case_id","material_version");--> statement-breakpoint
CREATE INDEX "assessment_versions_criteria_idx" ON "assessment_versions" USING btree ("criteria_round_id","criteria_version");--> statement-breakpoint
CREATE INDEX "assessments_case_idx" ON "assessments" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "assessments_contact_idx" ON "assessments" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "assessments_author_user_idx" ON "assessments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "assessments_previous_idx" ON "assessments" USING btree ("case_id","previous_id");--> statement-breakpoint
CREATE INDEX "review_requests_round_idx" ON "review_requests" USING btree ("organization_id","criteria_round_id");--> statement-breakpoint
CREATE INDEX "review_requests_case_idx" ON "review_requests" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "review_requests_contact_idx" ON "review_requests" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "review_requests_material_idx" ON "review_requests" USING btree ("case_id","material_version");--> statement-breakpoint
CREATE INDEX "review_requests_criteria_idx" ON "review_requests" USING btree ("criteria_round_id","criteria_version");--> statement-breakpoint
CREATE INDEX "funding_rounds_manager_user_idx" ON "funding_rounds" USING btree ("manager_user_id");--> statement-breakpoint
CREATE INDEX "funding_rounds_criteria_version_idx" ON "funding_rounds" USING btree ("id","criteria_version");--> statement-breakpoint
CREATE INDEX "guest_sessions_expiry_idx" ON "guest_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "guest_sessions_user_idx" ON "guest_sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE audit_events ADD CONSTRAINT audit_events_organization_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
--> statement-breakpoint
-- Current pointers are checked at commit so a root and its first version can be inserted together.
ALTER TABLE application_cases ADD CONSTRAINT application_cases_current_material_fk
  FOREIGN KEY (id, material_version) REFERENCES material_versions(case_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE funding_rounds ADD CONSTRAINT funding_rounds_current_criteria_fk
  FOREIGN KEY (id, criteria_version) REFERENCES criteria_versions(round_id, version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE assessments ADD CONSTRAINT assessments_previous_fk
  FOREIGN KEY (case_id, previous_id) REFERENCES assessments(case_id, id);
CREATE UNIQUE INDEX review_requests_outstanding_key ON review_requests(case_id, contact_id) WHERE status = 'outstanding';
--> statement-breakpoint
CREATE FUNCTION grantmaking_preserve_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_exists boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'criteria_version_items' THEN
      IF EXISTS (
        SELECT 1 FROM criteria_versions
        WHERE round_id = NEW.round_id AND version = NEW.version AND age(xmin) > 0
      ) THEN
        RAISE EXCEPTION 'Recorded grantmaking versions cannot be changed while their owner exists' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME IN ('material_version_answers', 'material_version_evidence') THEN
      IF EXISTS (
        SELECT 1 FROM material_versions
        WHERE case_id = NEW.case_id AND version = NEW.material_version AND age(xmin) > 0
      ) THEN
        RAISE EXCEPTION 'Recorded grantmaking versions cannot be changed while their owner exists' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'assessment_version_observations' THEN
      IF EXISTS (
        SELECT 1 FROM assessment_versions
        WHERE case_id = NEW.case_id AND assessment_id = NEW.assessment_id AND version = NEW.version AND age(xmin) > 0
      ) THEN
        RAISE EXCEPTION 'Recorded grantmaking versions cannot be changed while their owner exists' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME IN ('criteria_versions', 'criteria_version_items') THEN
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
CREATE TRIGGER material_version_answers_immutable BEFORE INSERT OR UPDATE OR DELETE ON material_version_answers FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER material_version_evidence_immutable BEFORE INSERT OR UPDATE OR DELETE ON material_version_evidence FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER criteria_versions_immutable BEFORE UPDATE OR DELETE ON criteria_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER criteria_version_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON criteria_version_items FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER assessment_versions_immutable BEFORE UPDATE OR DELETE ON assessment_versions FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
CREATE TRIGGER assessment_version_observations_immutable BEFORE INSERT OR UPDATE OR DELETE ON assessment_version_observations FOR EACH ROW EXECUTE FUNCTION grantmaking_preserve_version();
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
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
--> statement-breakpoint
-- unaccent is only STABLE, so indexes need this IMMUTABLE wrapper. Every search comparison
-- (stored text, typed words) goes through it so both sides are folded the same way.
CREATE FUNCTION merit_search_normalize(value text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN lower(public.unaccent('public.unaccent'::regdictionary, value));
--> statement-breakpoint
CREATE INDEX funding_rounds_title_search_idx ON funding_rounds
  USING gin (merit_search_normalize(title) public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX application_cases_search_idx ON application_cases
  USING gin (merit_search_normalize(search_title || ' ' || search_applicant) public.gin_trgm_ops);
--> statement-breakpoint
-- Request context is supplied by trusted server code and lives only in its transaction.
CREATE FUNCTION merit_scope() RETURNS jsonb LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('merit.scope', true), '')::jsonb
$$;
--> statement-breakpoint
CREATE FUNCTION merit_workspace_active(kind text, expires_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT kind = 'standard' OR expires_at > statement_timestamp()
$$;
--> statement-breakpoint
-- The migration owner can read the membership directory without recursively invoking
-- its policies. These functions expose only IDs for the current transaction.
CREATE FUNCTION merit_workspace_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT o.id FROM public.organizations o
  JOIN public.memberships m ON m.organization_id = o.id
  JOIN public.app_users u ON u.id = m.user_id
  CROSS JOIN (SELECT public.merit_scope() AS scope) ctx
  WHERE u.id = scope->>'userId' AND u.active
    AND public.merit_workspace_active(o.kind, o.demo_expires_at)
    AND CASE scope->>'kind'
      WHEN 'workspace' THEN o.slug = scope->>'slug'
      WHEN 'discovery' THEN true
      WHEN 'assignment' THEN o.id = (
        SELECT a.organization_id FROM public.review_assignments a WHERE a.id = (scope->>'assignmentId')::uuid
      )
      ELSE false END
$$;
--> statement-breakpoint
-- Provisioning, invitation acceptance and demo bootstrap operate on organization
-- metadata before the recipient has ordinary workspace access.
CREATE FUNCTION merit_onboarding_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH ctx AS (SELECT public.merit_scope() AS scope)
  SELECT scope->>'organizationId' FROM ctx WHERE scope->>'kind' = 'provision'
  UNION ALL SELECT i.organization_id FROM public.organization_invitations i, ctx
    WHERE scope->>'kind' = 'invitation' AND i.token_hash = scope->>'tokenHash'
  UNION ALL SELECT scope->>'newId' FROM ctx WHERE scope->>'kind' = 'demo'
  UNION ALL SELECT o.id FROM public.organizations o JOIN public.memberships m ON m.organization_id = o.id, ctx
    WHERE scope->>'kind' = 'demo' AND o.kind = 'demo' AND m.user_id = scope->>'userId'
$$;
--> statement-breakpoint
-- Child policies follow their indexed parent keys. Reads in discovery may span
-- active memberships; writes to grant data always require a single workspace.
DO $policies$
DECLARE
  entry record;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('organization_id IN (SELECT merit_workspace_ids())', ARRAY[
      'application_cases', 'application_creation_receipts', 'audit_events', 'contacts',
      'funding_rounds', 'round_creation_receipts', 'review_assignments',
      'assessment_versions', 'assessments', 'review_requests']),
    ('EXISTS (SELECT 1 FROM application_cases parent WHERE parent.id = case_id)', ARRAY[
      'material_draft_answers', 'material_drafts', 'material_version_answers',
      'material_version_evidence', 'material_versions', 'recommendation_versions',
      'assessment_version_observations', 'review_states']),
    ('EXISTS (SELECT 1 FROM funding_rounds parent WHERE parent.id = round_id)', ARRAY[
      'criteria_version_items', 'criteria_versions']),
    ('EXISTS (SELECT 1 FROM review_assignments parent WHERE parent.id = assignment_id)', ARRAY[
      'reviewer_command_receipts', 'reviewer_draft_observations', 'reviewer_drafts', 'reviewer_messages'])
  ) AS groups(predicate, tables) CROSS JOIN LATERAL unnest(tables) AS relation(name)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', entry.name);
    EXECUTE format('CREATE POLICY workspace_read ON %I FOR SELECT USING (%s)', entry.name, entry.predicate);
    EXECUTE format('CREATE POLICY workspace_write ON %I FOR ALL USING
      ((SELECT merit_scope()->>''kind'') IN (''workspace'', ''assignment'') AND %s)', entry.name, entry.predicate);
  END LOOP;
END $policies$;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_access ON organizations USING
  ((id IN (SELECT merit_workspace_ids()) AND (SELECT merit_scope()->>'kind') <> 'discovery')
   OR id IN (SELECT merit_onboarding_ids()));
CREATE POLICY discovery ON organizations FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'discovery' AND id IN (SELECT merit_workspace_ids()));
CREATE POLICY operator_directory ON organizations FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'organization_directory');
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_access ON memberships USING
  ((organization_id IN (SELECT merit_workspace_ids()) AND (SELECT merit_scope()->>'kind') <> 'discovery')
   OR organization_id IN (SELECT merit_onboarding_ids()));
CREATE POLICY discovery ON memberships FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'discovery' AND organization_id IN (SELECT merit_workspace_ids()));
CREATE POLICY operator_directory ON memberships FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'organization_directory' AND administration = 'owner');
--> statement-breakpoint
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_access ON organization_invitations USING (
  (organization_id IN (SELECT merit_workspace_ids()) AND (SELECT merit_scope()->>'kind') = 'workspace') OR
  ((SELECT merit_scope()->>'kind') = 'provision' AND organization_id IN (SELECT merit_onboarding_ids())) OR
  ((SELECT merit_scope()->>'kind') = 'invitation' AND token_hash = (SELECT merit_scope()->>'tokenHash'))
);
CREATE POLICY operator_directory ON organization_invitations FOR SELECT USING
  ((SELECT merit_scope()->>'kind') = 'organization_directory' AND purpose = 'provisioning');
--> statement-breakpoint
CREATE POLICY onboarding_event ON audit_events FOR INSERT WITH CHECK
  (organization_id IN (SELECT merit_onboarding_ids()) AND target_type IN ('organization', 'team_invitation', 'membership'));
--> statement-breakpoint
ALTER TABLE grant_navigation_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_navigation ON grant_navigation_pins USING (
  (SELECT merit_scope()->>'kind') = 'discovery' AND user_id = (SELECT merit_scope()->>'userId')
  AND EXISTS (SELECT 1 FROM app_users u WHERE u.id = user_id AND u.active)
);
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
--> statement-breakpoint
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
--> statement-breakpoint
-- Invalidate at the permission transition. A later reinstatement cannot reopen old previews.
CREATE FUNCTION merit_invalidate_member_chats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE public.assistant_conversations c
  SET status = 'unavailable', revision = revision + 1, updated_at = clock_timestamp()
  WHERE c.organization_id = OLD.organization_id AND c.user_id = OLD.user_id
    AND c.membership_id = OLD.id AND c.status <> 'unavailable'
    AND (TG_OP = 'DELETE'
      OR (NEW.role <> 'program_manager' AND c.state->'dependencies' @> '[{"kind":"grants"}]')
      OR (NEW.role NOT IN ('program_manager','reviewer') AND c.state->'dependencies' @> '[{"kind":"reviewer"}]')
      OR (NEW.role = 'reviewer' AND NEW.administration = 'none' AND c.state->'dependencies' @> '[{"kind":"team"}]'));
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION merit_invalidate_member_chats() FROM PUBLIC;
CREATE TRIGGER assistant_membership_revoked AFTER UPDATE OF administration, role OR DELETE ON memberships
FOR EACH ROW EXECUTE FUNCTION merit_invalidate_member_chats();
--> statement-breakpoint
CREATE FUNCTION merit_invalidate_assignment_chats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  dependency jsonb := jsonb_build_object('kind', 'assignment', 'assignmentId', OLD.id::text);
  loses_record boolean := true;
  loses_active boolean := false;
  loses_evidence boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.membership_id = NEW.membership_id
    AND (OLD.reviewer_user_id IS NULL OR OLD.reviewer_user_id IS NOT DISTINCT FROM NEW.reviewer_user_id) THEN
    loses_record := false;
    loses_active := OLD.status IN ('invited','accepted','submitted') AND NEW.status NOT IN ('invited','accepted','submitted');
    loses_evidence := OLD.status IN ('accepted','submitted') AND NEW.status NOT IN ('accepted','submitted');
    IF NOT (loses_active OR loses_evidence) THEN
      RETURN NULL;
    END IF;
  END IF;
  UPDATE public.assistant_conversations c
  SET status = 'unavailable', revision = revision + 1, updated_at = clock_timestamp()
  WHERE c.organization_id = OLD.organization_id AND c.membership_id = OLD.membership_id
    AND c.status <> 'unavailable' AND (
      (loses_record AND c.state->'dependencies' @> jsonb_build_array(dependency)) OR
      (loses_active AND c.state->'dependencies' @> jsonb_build_array(dependency || '{"active":true}'::jsonb)) OR
      (loses_evidence AND c.state->'dependencies' @> jsonb_build_array(dependency || '{"evidence":true}'::jsonb))
    );
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION merit_invalidate_assignment_chats() FROM PUBLIC;
CREATE TRIGGER assistant_assignment_revoked AFTER UPDATE OF status, membership_id, reviewer_user_id OR DELETE ON review_assignments
FOR EACH ROW EXECUTE FUNCTION merit_invalidate_assignment_chats();
--> statement-breakpoint
CREATE FUNCTION merit_invalidate_disabled_user_chats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE public.assistant_conversations SET status = 'unavailable', revision = revision + 1,
    updated_at = clock_timestamp() WHERE user_id = OLD.id AND status <> 'unavailable';
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION merit_invalidate_disabled_user_chats() FROM PUBLIC;
CREATE TRIGGER assistant_owner_disabled AFTER UPDATE OF active ON app_users FOR EACH ROW
WHEN (OLD.active AND NOT NEW.active) EXECUTE FUNCTION merit_invalidate_disabled_user_chats();
--> statement-breakpoint
-- Reconciliation discovers committed reviewer messages that still await delivery across
-- workspaces. It returns identifiers only, for the newest message of each kind per assignment and
-- only while delivery could proceed: an active acting user with a membership in a workspace that
-- is still active, and for an invitation, an assignment still invited and unexpired. Reading,
-- sending and recording an outcome always open a new transaction scoped to the returned user.
-- An invitation is delivered for the requesting manager. A submission notice goes to that manager
-- too, and is delivered for the submitting reviewer while the reviewer is still an active member,
-- else for the manager: the notice does not depend on the reviewer's continued access.
CREATE FUNCTION merit_pending_reviewer_messages(batch_size integer, after_id uuid)
RETURNS TABLE ("messageId" uuid, "assignmentId" uuid, kind text, "userId" text)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.id, m.assignment_id, m.kind, actor.user_id
  FROM public.reviewer_messages m
  JOIN public.review_assignments a ON a.id = m.assignment_id
  JOIN public.organizations o ON o.id = a.organization_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN m.kind = 'submission' AND EXISTS (
        SELECT 1 FROM public.app_users r
        JOIN public.memberships rm ON rm.user_id = r.id AND rm.organization_id = a.organization_id
        WHERE r.id = a.reviewer_user_id AND r.active)
      THEN a.reviewer_user_id ELSE a.manager_user_id END AS user_id) actor
  JOIN public.app_users u ON u.id = actor.user_id AND u.active
  WHERE m.status = 'pending' AND m.id > after_id
    AND public.merit_workspace_active(o.kind, o.demo_expires_at)
    AND EXISTS (
      SELECT 1 FROM public.memberships mb
      WHERE mb.organization_id = a.organization_id AND mb.user_id = actor.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.reviewer_messages newer
      WHERE newer.assignment_id = m.assignment_id AND newer.kind = m.kind
        AND (newer.created_at, newer.id) > (m.created_at, m.id))
    AND (m.kind = 'submission' OR (a.status = 'invited' AND a.expires_at > clock_timestamp()))
  ORDER BY m.id LIMIT greatest(0, least(batch_size, 100))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_pending_reviewer_messages(integer, uuid) FROM PUBLIC;
--> statement-breakpoint
-- A retry puts a failed message back to pending with a fresh delivery token, for a manager's
-- notice retry and for the assistant's retry of its own invitation. The message keeps its ID.
-- Only the newest message of its kind in a workspace the current member can access is revived,
-- and an invitation also needs its assignment still invited and unexpired.
CREATE FUNCTION merit_retry_reviewer_message(message_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH reset AS (
    UPDATE public.reviewer_messages m
      SET status = 'pending', delivery_token = gen_random_uuid()
      WHERE m.id = message_id AND m.status = 'failed'
        AND (public.merit_scope()->>'kind') = 'workspace'
        AND NOT EXISTS (
          SELECT 1 FROM public.reviewer_messages newer
          WHERE newer.assignment_id = m.assignment_id AND newer.kind = m.kind
            AND (newer.created_at, newer.id) > (m.created_at, m.id))
        AND EXISTS (
          SELECT 1 FROM public.review_assignments a
          WHERE a.id = m.assignment_id AND a.organization_id IN (SELECT public.merit_workspace_ids())
            AND (m.kind = 'submission' OR (a.status = 'invited' AND a.expires_at > clock_timestamp())))
      RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM reset)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_retry_reviewer_message(uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE INDEX "reviewer_messages_pending" ON "reviewer_messages" USING btree ("id") WHERE "reviewer_messages"."status" = 'pending';
--> statement-breakpoint
-- Withdrawing consent ends every member's running chats in the workspace, and a member's chats
-- are private to them. An administrator of the scoped workspace learns only the IDs of its running
-- chats, so Merit can cancel their work; nothing is returned to anyone else or for another
-- workspace. Call it before the consent is deleted, in the administrator's own transaction.
CREATE FUNCTION merit_workspace_running_assistant_conversations() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT c.id FROM public.assistant_conversations c
  WHERE c.status = 'running'
    AND (public.merit_scope()->>'kind') = 'workspace'
    AND c.organization_id IN (SELECT public.merit_workspace_ids())
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.organization_id = c.organization_id
        AND m.user_id = public.merit_scope()->>'userId'
        AND m.administration IN ('administrator', 'owner'))
  ORDER BY c.id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION merit_workspace_running_assistant_conversations() FROM PUBLIC;
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
