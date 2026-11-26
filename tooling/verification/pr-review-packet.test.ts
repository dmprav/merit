import { describe, expect, test } from "vite-plus/test";

import {
  extractSqlDdlDelta,
  parseAddedDiffLines,
  parseNumstatZ,
  renderReviewPacket,
  REVIEW_PACKET_MARKER,
  splitSqlStatements,
  summarizeDiffSize,
  upsertReviewPacketComment,
} from "./pr-review-packet.ts";

describe("pr-review-packet", () => {
  test("parses NUL-delimited numstat output including renames and binary files", () => {
    const raw = [
      "12\t3\tcapabilities/rounds/business/src/index.ts",
      "-\t-\ttooling/storybook/snapshots/a.png",
      "5\t2\t",
      "old/path.ts",
      "new/path.ts",
      "",
    ].join("\0");

    expect(parseNumstatZ(raw)).toEqual([
      { path: "capabilities/rounds/business/src/index.ts", additions: 12, deletions: 3 },
      { path: "tooling/storybook/snapshots/a.png", additions: 0, deletions: 0 },
      { path: "new/path.ts", additions: 5, deletions: 2 },
    ]);
  });

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

  test("parses added lines with accurate line numbers from unified diff", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -10,0 +11,2 @@",
      "+// oxlint-disable-next-line no-any",
      "+const x = value as any;",
      "diff --git a/src/deleted.ts b/src/deleted.ts",
      "--- a/src/deleted.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-export const old = 1;",
    ].join("\n");

    expect(parseAddedDiffLines(diff)).toEqual([
      { path: "src/a.ts", line: 11, text: "// oxlint-disable-next-line no-any" },
      { path: "src/a.ts", line: 12, text: "const x = value as any;" },
    ]);
  });

  test("renders an exception-only clean packet when no high-risk surfaces changed", () => {
    const markdown = renderReviewPacket({
      changedFiles: [{ status: "modified", path: "docs/README.md" }],
      numstat: [{ path: "docs/README.md", additions: 5, deletions: 2 }],
      addedLines: [],
      baseMigrationSql: "",
      headMigrationSql: "",
      recordContent: `# Verification record

## Behavioral decisions

None.

## Checks run

- \`vp run check:docs\`: passed.

## Could not verify

None.

## Did not verify

None.

## Dismissed review findings

None.
`,
    });

    expect(markdown).toContain(REVIEW_PACKET_MARKER);
    expect(markdown).toContain("**Docs/other:** `+5/-2` (1 file)");
    expect(markdown).toContain("No behavioral decisions, DB/schema deltas");
    expect(markdown).not.toContain("### Behavioral Decisions");
    expect(markdown).not.toContain("### DB & Schema Delta");
    expect(markdown).not.toContain("### Verification Integrity");
  });

  test("surfaces behavioral decisions, DB DDL, UI touches, contracts, and integrity flags", () => {
    const markdown = renderReviewPacket({
      changedFiles: [
        { status: "added", path: "foundation/db/database/migrations/0002_retry.sql" },
        { status: "modified", path: "capabilities/access/src/policy.ts" },
        { status: "modified", path: "capabilities/reviews/web/src/components/Banner.tsx" },
        { status: "modified", path: "capabilities/reviews/web/src/components/Banner.stories.tsx" },
        { status: "deleted", path: "capabilities/reviews/business/tests/old.test.ts" },
        { status: "modified", path: "pnpm-workspace.yaml" },
        { status: "modified", path: "app/.env.example" },
      ],
      numstat: [
        { path: "capabilities/access/src/policy.ts", additions: 20, deletions: 4 },
        { path: "capabilities/reviews/business/tests/old.test.ts", additions: 0, deletions: 40 },
        { path: "capabilities/reviews/web/src/components/Banner.tsx", additions: 15, deletions: 2 },
      ],
      addedLines: [
        { path: "capabilities/access/src/policy.ts", line: 42, text: "const raw = input as any;" },
        {
          path: "capabilities/reviews/business/tests/new.test.ts",
          line: 8,
          text: "test.skip('x', () => {});",
        },
        { path: "pnpm-workspace.yaml", line: 35, text: '  "@temporalio/client": 1.26.0' },
        { path: "app/.env.example", line: 26, text: "TEMPORAL_ADDRESS=127.0.0.1:7233" },
      ],
      baseMigrationSql: "",
      headMigrationSql:
        "CREATE FUNCTION retry_it() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;",
      recordContent: `# Verification record

## Behavioral decisions

- Retries for 15 minutes before marking failed.

## Checks run

- \`vp run test:ci\`: passed.

## Could not verify

- Live Temporal Cloud connection: no credentials.

## Did not verify

None.

## Dismissed review findings

None.
`,
    });

    expect(markdown).toContain(
      "### Behavioral Decisions\n- Retries for 15 minutes before marking failed.",
    );
    expect(markdown).toContain("### DB & Schema Delta");
    expect(markdown).toContain("CREATE FUNCTION retry_it()` **[SECURITY DEFINER]**");
    expect(markdown).toContain("### UI Touched");
    expect(markdown).toContain("Banner.stories.tsx");
    expect(markdown).toContain("### Contracts, Auth & Mechanisms");
    expect(markdown).toContain("@temporalio/client@1.26.0");
    expect(markdown).toContain("`TEMPORAL_ADDRESS`");
    expect(markdown).toContain("`authorization-policy` (extends)");
    expect(markdown).toContain("### Verification Integrity");
    expect(markdown).toContain("`as any at capabilities/access/src/policy.ts:42`");
    expect(markdown).toContain("`capabilities/reviews/business/tests/old.test.ts`");
    expect(markdown).toContain("`capabilities/reviews/business/tests/new.test.ts:8`");
    expect(markdown).toContain("**Could not verify:**");
    expect(markdown).toContain("Live Temporal Cloud connection");
  });

  test("embeds desktop UI screenshots and omitted story count inside UI Touched", () => {
    const markdown = renderReviewPacket({
      changedFiles: [
        { status: "modified", path: "foundation/ui/src/components/button/button.tsx" },
      ],
      numstat: [
        { path: "foundation/ui/src/components/button/button.tsx", additions: 4, deletions: 2 },
      ],
      addedLines: [],
      baseMigrationSql: "",
      headMigrationSql: "",
      screenshots: [
        {
          storyId: "components-button--overview",
          title: "Components/Button",
          name: "Overview",
          url: "https://raw.githubusercontent.com/dmprav/merit/abc123/pr-42/components-button--overview-desktop.png",
          passed: true,
        },
      ],
      omittedScreenshotCount: 2,
    });

    expect(markdown).toContain("#### Desktop Screenshots");
    expect(markdown).toContain(
      "**Components/Button — Overview** (`components-button--overview` · passed)",
    );
    expect(markdown).toContain(
      "![Components/Button — Overview](https://raw.githubusercontent.com/dmprav/merit/abc123/pr-42/components-button--overview-desktop.png)",
    );
    expect(markdown).toContain("_+2 more affected stories omitted._");
  });

  test("summarizes prod, test, and docs/other buckets cleanly", () => {
    expect(
      summarizeDiffSize([
        { path: "app/src/index.ts", additions: 10, deletions: 2 },
        { path: "app/src/index.test.ts", additions: 30, deletions: 5 },
        { path: "pnpm-lock.yaml", additions: 500, deletions: 100 },
      ]),
    ).toEqual({
      prod: { files: 1, additions: 10, deletions: 2 },
      tests: { files: 1, additions: 30, deletions: 5 },
      docsOther: { files: 1, additions: 500, deletions: 100 },
    });
  });

  test("upserts sticky PR comment across pagination by creating or patching in place", async () => {
    const requestUrl = (input: Parameters<typeof fetch>[0]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const calls: Array<{ url: string; method: string; body?: string }> = [];

    const createFetch: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (method === "GET") {
        // Another user quoting the marker must not be patched.
        return new Response(
          JSON.stringify([
            { id: 1, user: { login: "dmprav" }, body: `quoted ${REVIEW_PACKET_MARKER}` },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: 99 }), { status: 201 });
    };

    const created = await upsertReviewPacketComment({
      repo: "dmprav/merit",
      prNumber: 42,
      token: "tok",
      body: `${REVIEW_PACKET_MARKER}\nhello`,
      fetchImpl: createFetch,
    });
    expect(created).toEqual({ action: "created", id: 99 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://api.github.com/repos/dmprav/merit/issues/42/comments?per_page=100",
      "POST https://api.github.com/repos/dmprav/merit/issues/42/comments",
    ]);

    const patchCalls: Array<{ url: string; method: string }> = [];

    const updateFetch: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      patchCalls.push({ url, method });
      if (method === "GET" && url.includes("per_page=100") && !url.includes("page=2")) {
        return new Response(
          JSON.stringify([
            { id: 1, user: { login: "dmprav" }, body: `quoted ${REVIEW_PACKET_MARKER}` },
          ]),
          {
            status: 200,
            headers: {
              link: '<https://api.github.com/repos/dmprav/merit/issues/42/comments?per_page=100&page=2>; rel="next"',
            },
          },
        );
      }
      if (method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: 77,
              user: { login: "github-actions[bot]" },
              body: `${REVIEW_PACKET_MARKER}\nold packet`,
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: 77 }), { status: 200 });
    };

    const updated = await upsertReviewPacketComment({
      repo: "dmprav/merit",
      prNumber: 42,
      token: "tok",
      body: `${REVIEW_PACKET_MARKER}\nnew packet`,
      fetchImpl: updateFetch,
    });
    expect(updated).toEqual({ action: "updated", id: 77 });
    expect(patchCalls).toEqual([
      {
        method: "GET",
        url: "https://api.github.com/repos/dmprav/merit/issues/42/comments?per_page=100",
      },
      {
        method: "GET",
        url: "https://api.github.com/repos/dmprav/merit/issues/42/comments?per_page=100&page=2",
      },
      {
        method: "PATCH",
        url: "https://api.github.com/repos/dmprav/merit/issues/comments/77",
      },
    ]);
  });
});
