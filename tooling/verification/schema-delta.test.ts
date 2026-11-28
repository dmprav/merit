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
      },
      {
        action: "added",
        kind: "grant",
        summary: "REVOKE ALL ON FUNCTION merit_retry(uuid) FROM PUBLIC",
        securityDefiner: false,
      },
      {
        action: "added",
        kind: "policy",
        summary: "CREATE POLICY workspace_only ON existing",
        securityDefiner: false,
        table: "existing",
      },
    ]);
  });

  test("preserves SQL string and dollar-quoted literal whitespace and reports removed revocations", () => {
    const baseSql = `
      CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'a  b' $$;
      REVOKE ALL ON FUNCTION label() FROM PUBLIC;
    `;
    const headSql = `
      CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'a b' $$;
    `;

    expect(extractSqlDdlDelta(baseSql, headSql)).toEqual([
      {
        action: "added",
        kind: "function",
        summary: "CREATE FUNCTION label()",
        securityDefiner: false,
      },
      {
        action: "removed",
        kind: "function",
        summary: "CREATE FUNCTION label()",
        securityDefiner: false,
      },
      {
        action: "removed",
        kind: "grant",
        summary: "REVOKE ALL ON FUNCTION label() FROM PUBLIC",
        securityDefiner: false,
      },
    ]);
  });

  test("splits ALTER TABLE by what it changes and keeps unrecognized statements", () => {
    const changes = extractSqlDdlDelta(
      "",
      `
      ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ONLY "reviews" ADD CONSTRAINT "reviews_case_fk" FOREIGN KEY ("case_id") REFERENCES "cases"("id");
      ALTER TABLE "reviews" ADD COLUMN "model" text;
      ALTER TABLE "reviews" SET (fillfactor = 70);
      UPDATE reviews SET model = 'unknown' WHERE model IS NULL;
    `,
    );
    expect(changes.map(({ kind, summary, table }) => [kind, summary, table])).toEqual([
      ["rls", "ALTER TABLE reviews ENABLE ROW LEVEL SECURITY", "reviews"],
      ["constraint", "ALTER TABLE reviews ADD CONSTRAINT reviews_case_fk", "reviews"],
      ["column", "ALTER TABLE reviews ADD COLUMN model", "reviews"],
      ["alteration", "ALTER TABLE reviews SET (fillfactor = 70)", "reviews"],
      ["other", "UPDATE reviews SET model = 'unknown' WHERE model IS NULL", undefined],
    ]);
  });

  test("reports grants as the privileges that changed, regrouped by object", () => {
    const base = `
      GRANT SELECT, INSERT ON app_users, reviews TO :"runtime_role";
      GRANT UPDATE (id, name) ON app_users TO :"runtime_role";
      GRANT EXECUTE ON FUNCTION public.merit_finish(uuid, text) TO :"runtime_role";
    `;
    const head = `
      GRANT SELECT, INSERT ON app_users, reviews, ai_reviews, ai_review_items TO :"runtime_role";
      GRANT UPDATE (id, name, email) ON app_users TO :"runtime_role";
      REVOKE ALL ON FUNCTION public.merit_retry(uuid) FROM PUBLIC;
    `;
    expect(extractGrantDelta(base, head)).toEqual([
      {
        action: "added",
        statement: "GRANT SELECT, INSERT ON ai_reviews, ai_review_items TO :runtime_role",
      },
      {
        action: "added",
        statement: "GRANT UPDATE (id, name, email) ON app_users TO :runtime_role",
      },
      { action: "added", statement: "REVOKE ALL ON FUNCTION public.merit_retry(uuid) FROM PUBLIC" },
      { action: "removed", statement: "GRANT UPDATE (id, name) ON app_users TO :runtime_role" },
      {
        action: "removed",
        statement: "GRANT EXECUTE ON FUNCTION public.merit_finish(uuid, text) TO :runtime_role",
      },
    ]);
  });

  test("renders access changes in full, then one line per table", () => {
    const base = `
      CREATE TABLE "legacy" ("id" uuid PRIMARY KEY);
      CREATE TABLE "assessments" ("id" uuid PRIMARY KEY);
      CREATE INDEX "assessments_old_idx" ON "assessments" ("id");
      CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'a' $$;
      GRANT SELECT ON assessments TO :"runtime_role";
    `;
    const tables = ["ai_reviews", "ai_review_items"];
    const head = `
      CREATE TABLE "assessments" ("id" uuid PRIMARY KEY);
      ${tables.map((table) => `CREATE TABLE "${table}" ("id" uuid PRIMARY KEY, "organization_id" uuid);`).join("\n")}
      ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
      ALTER TABLE "ai_review_items" ADD CONSTRAINT "ai_review_items_review_fk" FOREIGN KEY ("id") REFERENCES "ai_reviews"("id");
      CREATE INDEX "ai_reviews_org_idx" ON "ai_reviews" ("organization_id");
      CREATE INDEX "ai_reviews_case_idx" ON "ai_reviews" ("id");
      CREATE TRIGGER ai_reviews_immutable BEFORE UPDATE OR DELETE ON ai_reviews FOR EACH ROW EXECUTE FUNCTION ai_reviews_preserve();
      CREATE FUNCTION ai_reviews_preserve() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE FUNCTION label() RETURNS text LANGUAGE sql AS $$ SELECT 'b' $$;
      CREATE FUNCTION merit_open(id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
      ALTER TABLE "assessments" ADD COLUMN "score" integer;
      DO $policies$
      DECLARE relation text;
      BEGIN
        FOREACH relation IN ARRAY ARRAY['ai_reviews', 'ai_review_items'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
          EXECUTE format('CREATE POLICY manager_read ON %I FOR SELECT USING (%s)', relation, 'true');
        END LOOP;
      END $policies$;
      CREATE POLICY "assessments_read" ON "assessments" USING (true);
      GRANT SELECT ON assessments, ai_reviews, ai_review_items TO :"runtime_role";
    `;

    expect(renderSchemaDelta({ baseSql: base, headSql: head })).toEqual([
      "- **Access:**",
      "  - `+` `CREATE FUNCTION merit_open(id uuid)` **[SECURITY DEFINER]**",
      "  - `+` `DO` block executing `ALTER TABLE %I ENABLE ROW LEVEL SECURITY`, `CREATE POLICY manager_read ON %I FOR SELECT USING (%s)`",
      "  - `+` `CREATE POLICY assessments_read ON assessments`",
      "  - `+` `GRANT SELECT ON ai_reviews, ai_review_items TO :runtime_role`",
      "- **Tables:**",
      "  - `legacy`: **dropped**",
      "  - `ai_review_items`: new; +1 constraint",
      "  - `ai_reviews`: new; +1 constraint, +2 indexes, +1 trigger",
      "  - `assessments`: +1 column, -1 index",
      "- **Functions:** `+` `ai_reviews_preserve()`, `~` `label()`",
      "- _`~` marks a statement changed in place._",
    ]);
    expect(renderSchemaDelta({ baseSql: base, headSql: base })).toEqual([
      "- No net SQL DDL changes detected.",
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
