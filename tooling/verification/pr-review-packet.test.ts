import { describe, expect, test } from "vite-plus/test";

import {
  describeScreenshotCoverage,
  EMPTY_REVIEW_PACKET_NOTE,
  extractSqlDdlDelta,
  mayAffectStorybook,
  parseAddedDiffLines,
  parseNumstatZ,
  parseReviewPacketArgs,
  renderReviewPacket,
  reviewPacketHasFindings,
  REVIEW_PACKET_MARKER,
  splitSqlStatements,
  summarizeDiffSize,
  summarizePaths,
  upsertReviewPacketComment,
  type ReviewPacketInput,
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

  test("keeps tabs inside numstat paths", () => {
    expect(parseNumstatZ(["1\t0\tsrc/example\tcase.test.ts", ""].join("\0"))).toEqual([
      { path: "src/example\tcase.test.ts", additions: 1, deletions: 0 },
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
    const input: ReviewPacketInput = {
      changedFiles: [{ status: "modified", path: "docs/README.md" }],
      numstat: [{ path: "docs/README.md", additions: 5, deletions: 2 }],
      addedLines: [],
      baseMigrationSql: "",
      headMigrationSql: "",
      recordContent: `# Verification record

## Behavioral decisions

- The guide now leads with the shared vocabulary.

## Checks run

- \`vp run check:docs\`: passed.

## Could not verify

None.

## Did not verify

None.

## Dismissed review findings

None.
`,
    };
    const markdown = renderReviewPacket(input);

    expect(markdown).toContain(REVIEW_PACKET_MARKER);
    expect(markdown).toContain("**Docs/other:** `+5/-2` (1 file)");
    // The description states decisions, so the packet does not repeat them.
    expect(markdown).toContain(EMPTY_REVIEW_PACKET_NOTE);
    expect(reviewPacketHasFindings(input)).toBe(false);
    expect(markdown).not.toContain("### Behavioral Decisions");
    expect(markdown).not.toContain("guide now leads");
    expect(markdown).not.toContain("### DB & Schema Delta");
    expect(markdown).not.toContain("### Verification Integrity");

    // Code that only composes a shared mechanism is routine and earns no packet.
    const composes: ReviewPacketInput = {
      ...input,
      changedFiles: [{ status: "modified", path: "capabilities/reviews/business/src/server/x.ts" }],
      recordContent: undefined,
    };
    expect(reviewPacketHasFindings(composes)).toBe(false);
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

    expect(markdown).not.toContain("Retries for 15 minutes");
    const order = [
      "### Verification Integrity",
      "### DB & Schema Delta",
      "### Contracts, Auth & Mechanisms",
      "### UI Touched",
    ].map((heading) => markdown.indexOf(heading));
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(markdown).toContain("CREATE FUNCTION retry_it()` **[SECURITY DEFINER]**");
    expect(markdown).toContain("### UI Touched");
    expect(markdown).toContain(
      "- **UI modules:** `capabilities/reviews/web/src/components/Banner.tsx`",
    );
    expect(markdown).not.toContain("Banner.stories.tsx");
    expect(markdown).toContain("### Contracts, Auth & Mechanisms");
    expect(markdown).toContain("@temporalio/client@1.26.0");
    expect(markdown).toContain("`TEMPORAL_ADDRESS`");
    expect(markdown).toMatch(
      /- \*\*Changes shared mechanism `authorization-policy`:\*\* Single policy table/u,
    );
    expect(markdown).toContain("### Verification Integrity");
    expect(markdown).toContain("`as any at capabilities/access/src/policy.ts:42`");
    expect(markdown).toContain("`capabilities/reviews/business/tests/old.test.ts`");
    expect(markdown).toContain("`capabilities/reviews/business/tests/new.test.ts:8`");
    expect(markdown).toContain("**Could not verify:**");
    expect(markdown).toContain("Live Temporal Cloud connection");
  });

  test("embeds desktop UI screenshots and how many affected story files they cover", () => {
    const screenshot = (storyId: string, storyFile: string) => ({
      storyId,
      title: "Components/Button",
      name: "Overview",
      storyFile,
      url: `https://raw.githubusercontent.com/dmprav/merit/abc123/pr-42/${storyId}-desktop.png`,
      passed: true,
    });

    const packet = (screenshots: ReturnType<typeof screenshot>[]) =>
      renderReviewPacket({
        changedFiles: [
          { status: "modified", path: "foundation/ui/src/components/button/button.tsx" },
        ],
        numstat: [
          { path: "foundation/ui/src/components/button/button.tsx", additions: 4, deletions: 2 },
        ],
        addedLines: [],
        baseMigrationSql: "",
        headMigrationSql: "",
        screenshots,
        affectedStoryFiles: { storyFiles: 5, directStoryFiles: 2 },
      });

    const markdown = packet([
      screenshot("components-button--overview", "foundation/ui/src/button/button.stories.tsx"),
    ]);

    expect(markdown).toContain("#### Desktop Screenshots");
    expect(markdown).toContain(
      "_Showing 1 of 5 affected story files, nearest to the change first. 2 changed or import a changed module directly._",
    );
    expect(markdown).toContain(
      "**Components/Button — Overview** (`components-button--overview` · passed)",
    );
    expect(markdown).toContain(
      "![Components/Button — Overview](https://raw.githubusercontent.com/dmprav/merit/abc123/pr-42/components-button--overview-desktop.png)",
    );

    // The coverage line stays visible; the images sit in a collapsed disclosure after it.
    const coverageAt = markdown.indexOf("_Showing 1 of 5");
    const openAt = markdown.indexOf("<details>\n<summary>Show 1 desktop screenshot</summary>\n");
    const imageAt = markdown.indexOf("![Components/Button");
    const closeAt = markdown.indexOf("\n</details>");
    expect(coverageAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(coverageAt);
    expect(imageAt).toBeGreaterThan(openAt);
    expect(closeAt).toBeGreaterThan(imageAt);

    const warned = packet([
      screenshot("components-button--overview", "foundation/ui/src/button/button.stories.tsx"),
      {
        ...screenshot("components-button--disabled", "foundation/ui/src/button/button.stories.tsx"),
        passed: false,
      },
    ]);
    expect(warned).toContain(
      "<summary>Show 2 desktop screenshots (1 with audit warnings)</summary>",
    );

    const variants = [
      screenshot("components-button--overview", "foundation/ui/src/button/button.stories.tsx"),
      screenshot("components-button--disabled", "foundation/ui/src/button/button.stories.tsx"),
    ];
    expect(describeScreenshotCoverage(variants, { storyFiles: 1, directStoryFiles: 1 })).toBe(
      "_Showing 1 of 1 affected story file, nearest to the change first. 1 changed or imports a changed module directly._",
    );
    expect(describeScreenshotCoverage(variants, { storyFiles: 9, directStoryFiles: 0 })).toBe(
      "_Showing 1 of 9 affected story files, nearest to the change first. None imports a changed module directly; each reaches the change through shared code._",
    );
  });

  test("reports affected story files even when no screenshot was captured", () => {
    const packet = (changedPath: string) =>
      renderReviewPacket({
        changedFiles: [{ status: "modified", path: changedPath }],
        numstat: [{ path: changedPath, additions: 1, deletions: 1 }],
        addedLines: [],
        baseMigrationSql: "",
        headMigrationSql: "",
        screenshots: [],
        affectedStoryFiles: { storyFiles: 4, directStoryFiles: 1 },
      });

    // A shared package reaches stories without being a UI module the section lists.
    const markdown = packet("foundation/money/src/index.ts");
    expect(markdown).toContain("### UI Touched");
    expect(markdown).toContain(
      "_Showing 0 of 4 affected story files, nearest to the change first. 1 changed or imports a changed module directly._",
    );
    expect(markdown).not.toContain("![");
    expect(markdown).not.toContain("<details>");
    expect(
      renderReviewPacket({
        changedFiles: [{ status: "modified", path: "docs/README.md" }],
        numstat: [{ path: "docs/README.md", additions: 1, deletions: 1 }],
        addedLines: [],
        baseMigrationSql: "",
        headMigrationSql: "",
        affectedStoryFiles: { storyFiles: 0, directStoryFiles: 0 },
      }),
    ).not.toContain("### UI Touched");
  });

  test("runs the screenshot job for any source the Storybook preview may bundle", () => {
    for (const path of [
      "tooling/storybook/.storybook/preview.tsx",
      "tooling/storybook/.storybook/styles.css",
      "foundation/forms/src/form/form.tsx",
      "foundation/money/src/index.ts",
      "capabilities/grantmaking/business/src/examples/get-example-round.ts",
      "capabilities/grantmaking/web/src/testing/providers.tsx",
      "capabilities/reviews/web/src/views/reviewer/reviewer-screen.stories.tsx",
      "interfaces/product/src/features/grantmaking/my-work.tsx",
    ]) {
      expect(mayAffectStorybook(path), path).toBe(true);
    }
    for (const path of [
      "capabilities/decisions/web/src/views/decision-editor.test.tsx",
      "foundation/ui/src/components/button/README.md",
      "foundation/ui/src/components/button/button.mdx",
      "tooling/verification/pr-screenshots.ts",
      "docs/guides/ui.md",
      "app/src/server/runtime-config.server.ts",
    ]) {
      expect(mayAffectStorybook(path), path).toBe(false);
    }
  });

  test("names a few paths and counts many by folder", () => {
    expect(summarizePaths(["b/x.ts", "a/y.ts", "a/y.ts"])).toBe("`a/y.ts`, `b/x.ts`");
    expect(summarizePaths(["t/w/a.ts", "t/w/b.ts", "t/w/c.ts", "t/w/d.ts"])).toBe(
      "4 files in `t/w/`",
    );
    expect(
      summarizePaths(["m/a.ts", "m/b.ts", "m/c.ts", "r/a.ts", "p/a.ts", "q/a.ts", "root.ts"]),
    ).toBe("7 files in `m/` (3), `./` (1), `p/` (1), _+2 more folders_");
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

    calls.length = 0;
    const skipped = await upsertReviewPacketComment({
      repo: "dmprav/merit",
      prNumber: 42,
      token: "tok",
      body: `${REVIEW_PACKET_MARKER}\nnothing`,
      createIfMissing: false,
      fetchImpl: createFetch,
    });
    expect(skipped).toEqual({ action: "skipped" });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);

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
      // An earlier revision's findings are still replaced when the packet has nothing to say.
      createIfMissing: false,
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

  test("reads flags strictly and falls back to the pull request environment", () => {
    const env = { PR_NUMBER: "42", PR_AUTHOR: "octo", PR_BASE_SHA: "base", PR_HEAD_SHA: "head" };
    expect(parseReviewPacketArgs([], {})).toEqual({
      author: "",
      baseRef: "origin/main",
      headRef: "HEAD",
      prNumber: undefined,
      screenshotsManifest: undefined,
      post: false,
    });
    expect(parseReviewPacketArgs(["--post", "--screenshots-manifest", "m.json"], env)).toEqual({
      author: "octo",
      baseRef: "base",
      headRef: "head",
      prNumber: 42,
      screenshotsManifest: "m.json",
      post: true,
    });
    expect(parseReviewPacketArgs(["--", "--pr=7", "--base", "main"], env)).toMatchObject({
      prNumber: 7,
      baseRef: "main",
    });
    expect(() => parseReviewPacketArgs(["--pr", "7abc"], {})).toThrow(
      '--pr must be a whole number of at least 1 (got "7abc").',
    );
    expect(() => parseReviewPacketArgs([], { PR_NUMBER: "0" })).toThrow("PR_NUMBER must be");
    expect(() => parseReviewPacketArgs(["--psot"], {})).toThrow("Unknown option '--psot'");
  });
});
