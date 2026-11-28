import { describe, expect, test } from "vite-plus/test";

import {
  extractGrantDelta,
  extractSqlDdlDelta,
  renderSchemaDelta,
  splitSqlStatements,
} from "./schema-delta.ts";

describe("schema-delta", () => {
  test("splits SQL statements across dollar-quoted function bodies and comments", () => {
    const sql = `
      -- Leading comment with ; semicolon
      CREATE FUNCTION demo() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        PERFORM 1;
        PERFORM 2;
      END;
      $$;
      /* block comment; */
      CREATE INDEX idx_demo ON public.demo (id);
    `;

    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE FUNCTION demo()");
    expect(statements[0]).toContain("PERFORM 2;");
    expect(statements[1]).toBe("CREATE INDEX idx_demo ON public.demo (id)");
  });

  test("extracts only net SQL DDL changes when migrations are squashed", () => {
    const baseSql = `
      CREATE TABLE "existing" ("id" uuid PRIMARY KEY);
      CREATE INDEX "existing_idx" ON "existing" ("id");
    `;
    const headSql = `
      CREATE TABLE "existing" ("id" uuid PRIMARY KEY);
      CREATE INDEX "existing_idx" ON "existing" ("id");
      CREATE INDEX "new_pending_idx" ON "existing" ("id") WHERE "id" IS NOT NULL;
      CREATE FUNCTION merit_retry(id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
      REVOKE ALL ON FUNCTION merit_retry(uuid) FROM PUBLIC;
      CREATE POLICY "workspace_only" ON "existing" USING (true);
    `;

    expect(extractSqlDdlDelta(baseSql, headSql)).toEqual([
      {
        action: "added",
        kind: "index",
        summary: "CREATE INDEX new_pending_idx ON existing",
        securityDefiner: false,
        table: "existing",
      },
      {
        action: "added",
        kind: "function",
        summary: "CREATE FUNCTION merit_retry(id uuid)",
        securityDefiner: true,
        access: true,
      },
      {
        action: "added",
        kind: "grant",
        summary: "REVOKE ALL ON FUNCTION merit_retry(uuid) FROM PUBLIC",
        securityDefiner: false,
        access: true,
      },
      {
        action: "added",
        kind: "policy",
        summary: "CREATE POLICY workspace_only ON existing",
        securityDefiner: false,
        table: "existing",
        access: true,
      },
    ]);
  });

  test("preserves SQL string and dollar-quoted literal whitespace", () => {
    const changes = extractSqlDdlDelta(
      "CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'a  b' $$;",
      "CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'a b' $$;",
    );
    expect(changes.map(({ action, summary }) => [action, summary])).toEqual([
      ["added", "CREATE FUNCTION label()"],
      ["removed", "CREATE FUNCTION label()"],
    ]);
  });

  test("classifies each ALTER TABLE action, telling constraints from columns", () => {
    const changes = extractSqlDdlDelta(
      "",
      `
      ALTER TABLE ONLY "reviews" ADD CONSTRAINT "reviews_case_fk" FOREIGN KEY ("case_id") REFERENCES "cases"("id");
      ALTER TABLE reviews ADD PRIMARY KEY (id), ADD UNIQUE (case_id), ADD CHECK (score > 0);
      ALTER TABLE reviews ADD COLUMN "model" text, DISABLE ROW LEVEL SECURITY;
      ALTER TABLE reviews DROP COLUMN legacy, ALTER CONSTRAINT reviews_case_fk DEFERRABLE;
      ALTER TABLE reviews RENAME TO ai_reviews;
      UPDATE reviews SET model = 'unknown' WHERE model IS NULL;
    `,
    );
    expect(
      changes.map(({ kind, summary, drops, access }) => [kind, summary, drops, access]),
    ).toEqual([
      ["constraint", "ALTER TABLE reviews ADD CONSTRAINT reviews_case_fk", undefined, undefined],
      ["constraint", "ALTER TABLE reviews ADD CONSTRAINT PRIMARY KEY", undefined, undefined],
      ["constraint", "ALTER TABLE reviews ADD CONSTRAINT UNIQUE", undefined, undefined],
      ["constraint", "ALTER TABLE reviews ADD CONSTRAINT CHECK", undefined, undefined],
      ["column", "ALTER TABLE reviews ADD COLUMN model", undefined, undefined],
      ["rls", "ALTER TABLE reviews DISABLE ROW LEVEL SECURITY", undefined, true],
      ["column", "ALTER TABLE reviews DROP COLUMN legacy", true, undefined],
      ["constraint", "ALTER TABLE reviews ALTER CONSTRAINT reviews_case_fk", undefined, undefined],
      ["alteration", "ALTER TABLE reviews RENAME TO ai_reviews", undefined, undefined],
      ["other", "UPDATE reviews SET model = 'unknown' WHERE model IS NULL", undefined, undefined],
    ]);
  });

  test("compares grants per privilege, column, object, and role", () => {
    const base = `
      GRANT SELECT, INSERT ON app_users, reviews TO :"runtime_role";
      GRANT UPDATE (id, name) ON app_users TO :"runtime_role";
      GRANT EXECUTE ON FUNCTION public.merit_finish(uuid, text) TO :"runtime_role";
      GRANT SELECT ON audit_events TO :"runtime_role";
    `;
    const head = `
      grant select, insert on app_users, reviews, ai_reviews, ai_review_items to :"runtime_role";
      GRANT UPDATE (id, name, email) ON app_users TO :"runtime_role";
      GRANT EXECUTE ON FUNCTION public.merit_finish(uuid,text) TO :"runtime_role" GRANTED BY postgres;
      GRANT SELECT ON audit_events TO :"runtime_role" WITH GRANT OPTION;
      REVOKE GRANT OPTION FOR DELETE ON reviews FROM :"runtime_role";
      GRANT ALL (secret) ON vault TO :"runtime_role";
    `;
    expect(extractGrantDelta(base, head)).toEqual([
      {
        action: "added",
        statement: "GRANT SELECT, INSERT ON ai_reviews, ai_review_items TO :runtime_role",
      },
      { action: "added", statement: "GRANT UPDATE (email) ON app_users TO :runtime_role" },
      { action: "added", statement: "GRANT ALL (secret) ON vault TO :runtime_role" },
      {
        action: "added",
        statement: "GRANT SELECT ON audit_events TO :runtime_role WITH GRANT OPTION",
      },
      {
        action: "added",
        statement: "REVOKE GRANT OPTION FOR DELETE ON reviews FROM :runtime_role",
      },
      { action: "removed", statement: "GRANT SELECT ON audit_events TO :runtime_role" },
    ]);
  });

  test("renders access changes in full, then one line per table", () => {
    const base = `
      CREATE TABLE "legacy" ("id" uuid PRIMARY KEY);
      CREATE TABLE "assessments" ("id" uuid PRIMARY KEY, "score" integer, CONSTRAINT "positive" CHECK (score > 0));
      CREATE INDEX "assessments_old_idx" ON "assessments" ("id");
      CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'a' $$;
      CREATE FUNCTION merit_close(id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT $$;
      GRANT SELECT ON assessments TO :"runtime_role";
    `;
    const head = `
      CREATE TABLE "assessments" ("id" uuid PRIMARY KEY, "score" bigint, "note" text);
      CREATE TABLE "ai_reviews" ("id" uuid PRIMARY KEY, "organization_id" uuid);
      ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
      CREATE INDEX "ai_reviews_org_idx" ON "ai_reviews" ("organization_id");
      CREATE TRIGGER ai_reviews_immutable BEFORE UPDATE ON ai_reviews FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
      CREATE FUNCTION ai_reviews_preserve() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'b' $$;
      CREATE FUNCTION merit_close(id uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.merit_open (id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
      DROP TABLE legacy;
      CREATE POLICY "assessments_read" ON "assessments" USING (true);
      GRANT SELECT ON assessments, ai_reviews TO :"runtime_role";
      GRANT merit_admin TO :"runtime_role";
    `;

    expect(renderSchemaDelta({ baseSql: base, headSql: head })).toEqual([
      "- **Access:**",
      "  - `~` `CREATE FUNCTION merit_close(id uuid)` **[SECURITY DEFINER removed]**",
      "  - `+` `CREATE FUNCTION public.merit_open(id uuid)` **[SECURITY DEFINER]**",
      "  - `+` `CREATE POLICY assessments_read ON assessments`",
      '  - `+` `GRANT merit_admin TO :"runtime_role"`',
      "  - `+` `GRANT SELECT ON ai_reviews TO :runtime_role`",
      "- **Tables:**",
      "  - `legacy`: **dropped**",
      "  - `ai_reviews`: new; +1 constraint, +1 index, +1 trigger",
      "  - `assessments`: +1 column, ~1 column, -1 constraint, -1 index",
      "- **Functions:** `+` `ai_reviews_preserve()`, `~` `label()`",
      "- _`~` marks a statement changed in place._",
    ]);
    expect(renderSchemaDelta({ baseSql: base, headSql: base })).toEqual([
      "- No net SQL DDL changes detected.",
    ]);
  });

  test("treats a dropped table or column in a new migration as a removal", () => {
    const base = "CREATE TABLE legacy (id uuid); CREATE TABLE keep (id uuid, a int);";
    const head = `${base} DROP TABLE legacy; ALTER TABLE keep DROP COLUMN a;`;
    expect(renderSchemaDelta({ baseSql: base, headSql: head })).toEqual([
      "- **Tables:**",
      "  - `legacy`: **dropped**",
      "  - `keep`: -1 column",
    ]);
  });

  test("puts every statement that changes access in the uncapped access list", () => {
    const head = `
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO reporting;
      ALTER ROLE merit_runtime BYPASSRLS;
      CREATE VIEW open_reviews AS SELECT * FROM reviews;
      ALTER FUNCTION merit_retry(uuid) SECURITY DEFINER;
      CREATE PROCEDURE merit_sweep() LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      ALTER TABLE reviews OWNER TO merit_owner;
      ALTER TABLE reviews DISABLE TRIGGER reviews_immutable;
      ${Array.from({ length: 15 }, (_, index) => `CREATE TYPE kind_${index} AS ENUM ('a');`).join("\n")}
    `;
    const lines = renderSchemaDelta({ baseSql: "", headSql: head });
    const access = lines.slice(
      lines.indexOf("- **Access:**") + 1,
      lines.indexOf("- **Other statements:**"),
    );
    expect(access).toEqual([
      "  - `+` `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO reporting`",
      "  - `+` `ALTER ROLE merit_runtime BYPASSRLS`",
      "  - `+` `CREATE VIEW open_reviews AS SELECT * FROM reviews`",
      "  - `+` `ALTER FUNCTION merit_retry(uuid) SECURITY DEFINER`",
      "  - `+` `CREATE PROCEDURE merit_sweep()` **[SECURITY DEFINER]**",
      "  - `+` `ALTER TABLE reviews OWNER TO merit_owner`",
      "  - `+` `ALTER TABLE reviews DISABLE TRIGGER reviews_immutable`",
    ]);
    // Statements no pattern recognizes are all listed, never capped.
    expect(lines.filter((line) => line.includes("CREATE TYPE"))).toHaveLength(15);
  });

  test("quotes what a DO block runs and which of its literals changed", () => {
    const policies = (tables: string) => `
      DO $policies$
      DECLARE relation text;
      BEGIN
        FOREACH relation IN ARRAY ARRAY[${tables}] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
          EXECUTE format($q$CREATE POLICY workspace_read ON %I FOR SELECT USING (organization_id IN (SELECT merit_workspace_ids()))$q$, relation);
        END LOOP;
      END $policies$;
    `;

    expect(
      renderSchemaDelta({
        baseSql: policies("'reviews'"),
        headSql: policies("'reviews', 'committee_decision_versions'"),
      }),
    ).toEqual([
      "- **Access:**",
      "  - `~` `DO` block running `ALTER TABLE %I ENABLE ROW LEVEL SECURITY`, `CREATE POLICY workspace_read ON %I FOR SELECT USING (organization_id IN (SELECT merit_workspace_ids()))`; adds `'committee_decision_versions'`",
      "- _`~` marks a statement changed in place._",
    ]);
    expect(
      renderSchemaDelta({
        baseSql: "",
        headSql: "DO $$ BEGIN ALTER TABLE reviews DISABLE ROW LEVEL SECURITY; END $$;",
      }),
    ).toEqual([
      "- **Access:**",
      "  - `+` `DO` block running `ALTER TABLE reviews DISABLE ROW LEVEL SECURITY`",
    ]);
  });

  test("never caps access changes, however many tables a change touches", () => {
    const head = Array.from(
      { length: 30 },
      (_, index) =>
        `CREATE TABLE t${index} (id uuid); ALTER TABLE t${index} ENABLE ROW LEVEL SECURITY;`,
    ).join("\n");
    const lines = renderSchemaDelta({ baseSql: "", headSql: head });
    expect(lines.filter((line) => line.includes("ENABLE ROW LEVEL SECURITY"))).toHaveLength(30);
    expect(lines).toContain("  - _+18 more tables_");
  });
});
