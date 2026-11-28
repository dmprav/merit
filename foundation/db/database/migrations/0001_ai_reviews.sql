CREATE TABLE "ai_review_citations" (
	"organization_id" text NOT NULL,
	"ai_review_id" uuid NOT NULL,
	"section_ordinal" integer NOT NULL,
	"kind" text DEFAULT 'claim' NOT NULL,
	"item_ordinal" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"source" text NOT NULL,
	"quote" text NOT NULL,
	CONSTRAINT "ai_review_citations_ai_review_id_section_ordinal_item_ordinal_ordinal_pk" PRIMARY KEY("ai_review_id","section_ordinal","item_ordinal","ordinal"),
	CONSTRAINT "ai_review_citations_kind_check" CHECK ("ai_review_citations"."kind" IN ('claim')),
	CONSTRAINT "ai_review_citations_ordinal_check" CHECK ("ai_review_citations"."ordinal" >= 0),
	CONSTRAINT "ai_review_citations_source_check" CHECK (length(btrim("ai_review_citations"."source")) > 0),
	CONSTRAINT "ai_review_citations_quote_check" CHECK (length(btrim("ai_review_citations"."quote")) > 0),
	CONSTRAINT "ai_review_citations_quote_length_check" CHECK (length("ai_review_citations"."quote") <= 500)
);
--> statement-breakpoint
CREATE TABLE "ai_review_items" (
	"organization_id" text NOT NULL,
	"ai_review_id" uuid NOT NULL,
	"section_ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "ai_review_items_ai_review_id_section_ordinal_kind_ordinal_pk" PRIMARY KEY("ai_review_id","section_ordinal","kind","ordinal"),
	CONSTRAINT "ai_review_items_kind_check" CHECK ("ai_review_items"."kind" IN ('claim', 'gap', 'strength', 'weakness', 'concern')),
	CONSTRAINT "ai_review_items_ordinal_check" CHECK ("ai_review_items"."ordinal" >= 0),
	CONSTRAINT "ai_review_items_text_check" CHECK (length(btrim("ai_review_items"."text")) > 0),
	CONSTRAINT "ai_review_items_text_length_check" CHECK (length("ai_review_items"."text") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "ai_review_questions" (
	"organization_id" text NOT NULL,
	"ai_review_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "ai_review_questions_ai_review_id_ordinal_pk" PRIMARY KEY("ai_review_id","ordinal"),
	CONSTRAINT "ai_review_questions_ordinal_check" CHECK ("ai_review_questions"."ordinal" >= 0),
	CONSTRAINT "ai_review_questions_text_check" CHECK (length(btrim("ai_review_questions"."text")) > 0),
	CONSTRAINT "ai_review_questions_text_length_check" CHECK (length("ai_review_questions"."text") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "ai_review_sections" (
	"organization_id" text NOT NULL,
	"ai_review_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"criterion_id" uuid,
	"criterion_title" text NOT NULL,
	CONSTRAINT "ai_review_sections_ai_review_id_ordinal_pk" PRIMARY KEY("ai_review_id","ordinal"),
	CONSTRAINT "ai_review_sections_ordinal_check" CHECK ("ai_review_sections"."ordinal" >= 0),
	CONSTRAINT "ai_review_sections_title_check" CHECK (length(btrim("ai_review_sections"."criterion_title")) > 0),
	CONSTRAINT "ai_review_sections_title_length_check" CHECK (length("ai_review_sections"."criterion_title") <= 200)
);
--> statement-breakpoint
CREATE TABLE "ai_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"application_version" integer NOT NULL,
	"round_id" text NOT NULL,
	"criteria_version" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"run_by_user_id" text NOT NULL,
	"run_by_name" text NOT NULL,
	"provenance_interface" text NOT NULL,
	"provenance_client_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" text NOT NULL,
	"amount_minor_units" numeric(30, 0) NOT NULL,
	"amount_currency" text NOT NULL,
	"reasoning" text NOT NULL,
	CONSTRAINT "ai_reviews_run_key" UNIQUE("organization_id","run_id"),
	CONSTRAINT "ai_reviews_application_version_check" CHECK ("ai_reviews"."application_version" > 0),
	CONSTRAINT "ai_reviews_criteria_version_check" CHECK ("ai_reviews"."criteria_version" > 0),
	CONSTRAINT "ai_reviews_provider_check" CHECK (length(btrim("ai_reviews"."provider")) > 0),
	CONSTRAINT "ai_reviews_model_check" CHECK (length(btrim("ai_reviews"."model")) > 0),
	CONSTRAINT "ai_reviews_position_check" CHECK ("ai_reviews"."position" IN ('Fund', 'Fund with a condition', 'Defer', 'Decline')),
	CONSTRAINT "ai_reviews_amount_check" CHECK ("ai_reviews"."amount_minor_units" >= 0 and "ai_reviews"."amount_minor_units" <> 'NaN' and "ai_reviews"."amount_currency" = 'EUR'),
	CONSTRAINT "ai_reviews_position_amount_check" CHECK (("ai_reviews"."position" in ('Decline', 'Defer')) = ("ai_reviews"."amount_minor_units" = 0)),
	CONSTRAINT "ai_reviews_reasoning_check" CHECK (length(btrim("ai_reviews"."reasoning")) > 0 and length("ai_reviews"."reasoning") <= 20000),
	CONSTRAINT "ai_reviews_provenance_check" CHECK (("ai_reviews"."provenance_interface" = 'web' and "ai_reviews"."provenance_client_id" is null) or ("ai_reviews"."provenance_interface" = 'mcp' and "ai_reviews"."provenance_client_id" is not null and length(btrim("ai_reviews"."provenance_client_id")) > 0))
);
--> statement-breakpoint
ALTER TABLE "ai_review_citations" ADD CONSTRAINT "ai_review_citations_ai_review_id_section_ordinal_kind_item_ordinal_ai_review_items_ai_review_id_section_ordinal_kind_ordinal_fk" FOREIGN KEY ("ai_review_id","section_ordinal","kind","item_ordinal") REFERENCES "public"."ai_review_items"("ai_review_id","section_ordinal","kind","ordinal") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_ai_review_id_section_ordinal_ai_review_sections_ai_review_id_ordinal_fk" FOREIGN KEY ("ai_review_id","section_ordinal") REFERENCES "public"."ai_review_sections"("ai_review_id","ordinal") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_questions" ADD CONSTRAINT "ai_review_questions_ai_review_id_ai_reviews_id_fk" FOREIGN KEY ("ai_review_id") REFERENCES "public"."ai_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_sections" ADD CONSTRAINT "ai_review_sections_ai_review_id_ai_reviews_id_fk" FOREIGN KEY ("ai_review_id") REFERENCES "public"."ai_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_organization_id_case_id_application_cases_organization_id_id_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."application_cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_organization_id_round_id_funding_rounds_organization_id_id_fk" FOREIGN KEY ("organization_id","round_id") REFERENCES "public"."funding_rounds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_case_id_application_version_material_versions_case_id_version_fk" FOREIGN KEY ("case_id","application_version") REFERENCES "public"."material_versions"("case_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_round_id_criteria_version_criteria_versions_round_id_version_fk" FOREIGN KEY ("round_id","criteria_version") REFERENCES "public"."criteria_versions"("round_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_review_citations_claim_idx" ON "ai_review_citations" USING btree ("ai_review_id","section_ordinal","kind","item_ordinal");--> statement-breakpoint
CREATE INDEX "ai_reviews_case_idx" ON "ai_reviews" USING btree ("organization_id","case_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_reviews_round_idx" ON "ai_reviews" USING btree ("organization_id","round_id");--> statement-breakpoint
CREATE INDEX "ai_reviews_application_idx" ON "ai_reviews" USING btree ("case_id","application_version");--> statement-breakpoint
CREATE INDEX "ai_reviews_criteria_idx" ON "ai_reviews" USING btree ("round_id","criteria_version");
--> statement-breakpoint
-- A saved run and everything under it is immutable while its application exists. Children are
-- written with their run and never later; removal happens only with the workspace's applications.
CREATE FUNCTION ai_reviews_preserve() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_exists boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM ai_reviews WHERE id = NEW.ai_review_id AND age(xmin) > 0) THEN
      RAISE EXCEPTION 'Recorded AI reviews cannot be changed while their application exists' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'ai_reviews' THEN
      SELECT EXISTS (SELECT 1 FROM application_cases WHERE id = OLD.case_id) INTO owner_exists;
    ELSE
      SELECT EXISTS (SELECT 1 FROM ai_reviews WHERE id = OLD.ai_review_id) INTO owner_exists;
    END IF;
    IF NOT owner_exists THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'Recorded AI reviews cannot be changed while their application exists' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_reviews_immutable BEFORE UPDATE OR DELETE ON ai_reviews FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
CREATE TRIGGER ai_review_sections_immutable BEFORE INSERT OR UPDATE OR DELETE ON ai_review_sections FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
CREATE TRIGGER ai_review_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON ai_review_items FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
CREATE TRIGGER ai_review_citations_immutable BEFORE INSERT OR UPDATE OR DELETE ON ai_review_citations FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
CREATE TRIGGER ai_review_questions_immutable BEFORE INSERT OR UPDATE OR DELETE ON ai_review_questions FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
--> statement-breakpoint
-- AI reviews belong to program-manager work in one workspace (the work_on_grants policy). Neither
-- discovery nor an assignment scope reaches them, and a reviewer member's connection can never read one.
DO $policies$
DECLARE
  relation text;
  predicate text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['ai_reviews', 'ai_review_sections', 'ai_review_items',
    'ai_review_citations', 'ai_review_questions']
  LOOP
    predicate := format('(SELECT merit_scope()->>''kind'') = ''workspace''
      AND organization_id IN (SELECT merit_workspace_ids())
      AND EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = %I.organization_id
        AND m.user_id = (SELECT merit_scope()->>''userId'') AND m.role = ''program_manager'')', relation);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY manager_read ON %I FOR SELECT USING (%s)', relation, predicate);
    EXECUTE format('CREATE POLICY manager_write ON %I FOR ALL USING (%s)', relation, predicate);
  END LOOP;
END $policies$;
