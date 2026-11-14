ALTER TABLE "application_cases" ADD COLUMN "search_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_cases" ADD COLUMN "search_applicant" text DEFAULT '' NOT NULL;
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
UPDATE application_cases AS c
  SET search_title = coalesce(m.content->>'title', ''),
      search_applicant = coalesce(m.content->'submission'->>'organization', '')
  FROM material_versions AS m
  WHERE m.case_id = c.id AND m.version = c.material_version;
--> statement-breakpoint
CREATE INDEX funding_rounds_title_search_idx ON funding_rounds
  USING gin (merit_search_normalize(title) public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX application_cases_search_idx ON application_cases
  USING gin (merit_search_normalize(search_title || ' ' || search_applicant) public.gin_trgm_ops);
