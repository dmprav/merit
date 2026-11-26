import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import {
  AGENT_LABELS,
  checkAgentPolicy,
  extractLinkedIssueNumbers,
  findProtectedPaths,
  parseProposalMarker,
} from "./agent-policy.ts";
import { parseNameStatusZ } from "./verification-record.ts";

const maintainerApprovalComment = (paths: string[]) => ({
  authorAssociation: "OWNER",
  body: `<!-- merit-approve-protected: ${JSON.stringify({ paths })} -->`,
});

describe("agent-policy", () => {
  test("exempts pull requests not labeled agent:pr", () => {
    const result = checkAgentPolicy({
      isAgentPr: false,
      changedFiles: [{ status: "modified", path: ".github/workflows/verify.yml" }],
      linkedIssues: [],
    });
    expect(result.exempt).toContain("agent:pr");
  });

  test("allows ordinary code and doc changes on agent:pr without special approval", () => {
    const result = checkAgentPolicy({
      isAgentPr: true,
      changedFiles: [
        { status: "modified", path: "capabilities/reviews/business/src/domain/reviewer.ts" },
        { status: "added", path: "verifications/220.md" },
      ],
      linkedIssues: [],
    });
    expect(result).toEqual({ exempt: null, errors: [] });
  });

  test("rejects unapproved, untrusted-comment, closed, wontfix, or still-proposed issues for protected paths", () => {
    const protectedFiles = [
      { status: "modified" as const, path: ".github/workflows/verify.yml" },
      { status: "modified" as const, path: ".claude/.secret-setting" },
      { status: "modified" as const, path: "tooling/verification/verification-record.ts" },
      { status: "modified" as const, path: "tooling/agents/proposal.ts" },
      { status: "modified" as const, path: ".fallowrc.jsonc" },
      { status: "modified" as const, path: "capabilities/access/src/domain/policies.ts" },
    ];
    const allPaths = [
      ".github/**",
      ".claude/**",
      "tooling/verification/**",
      "tooling/agents/**",
      ".fallowrc.jsonc",
      "capabilities/access/src/**",
    ];

    for (const badIssue of [
      {
        number: 1,
        state: "OPEN",
        labels: ["agent:ready"],
        comments: [maintainerApprovalComment(allPaths)],
      },
      {
        number: 2,
        state: "CLOSED",
        labels: [AGENT_LABELS.allowProtected],
        comments: [maintainerApprovalComment(allPaths)],
      },
      {
        number: 3,
        state: "OPEN",
        labels: [AGENT_LABELS.allowProtected, "wontfix"],
        comments: [maintainerApprovalComment(allPaths)],
      },
      {
        number: 4,
        state: "OPEN",
        labels: [AGENT_LABELS.allowProtected, "agent:proposed"],
        comments: [maintainerApprovalComment(allPaths)],
      },
      {
        number: 5,
        state: "OPEN",
        labels: [AGENT_LABELS.allowProtected],
        comments: [{ authorAssociation: "NONE", body: maintainerApprovalComment(allPaths).body }],
      },
      { number: 6, state: "OPEN", labels: [AGENT_LABELS.allowProtected], comments: [] },
    ]) {
      const result = checkAgentPolicy({
        isAgentPr: true,
        changedFiles: protectedFiles,
        linkedIssues: [badIssue],
      });
      expect(result.exempt).toBeNull();
      if (result.exempt === null) {
        expect(result.errors).toHaveLength(protectedFiles.length);
      }
    }
  });

  test("allows protected paths explicitly authorized by a maintainer comment on an OPEN labeled issue", () => {
    const result = checkAgentPolicy({
      isAgentPr: true,
      changedFiles: [
        { status: "modified", path: "tooling/verification/lint.ts" },
        { status: "modified", path: ".claude/.settings-extra" },
        { status: "modified", path: ".github/workflows/verify.yml" },
        { status: "added", path: "foundation/db/database/migrations/0015_add_index.sql" },
      ],
      linkedIssues: [
        {
          number: 42,
          state: "OPEN",
          labels: ["agent:ready", AGENT_LABELS.allowProtected],
          comments: [
            maintainerApprovalComment([
              "tooling/verification/lint.ts",
              ".claude/**",
              ".github/*/**",
              "foundation/db/database/migrations/**",
            ]),
          ],
        },
      ],
    });
    expect(result).toEqual({ exempt: null, errors: [] });
  });

  test("rejects catch-all globs and fenced spoofed markers", () => {
    const catchAllResult = checkAgentPolicy({
      isAgentPr: true,
      changedFiles: [{ status: "modified", path: "vite.config.ts" }],
      linkedIssues: [
        {
          number: 43,
          state: "OPEN",
          labels: [AGENT_LABELS.allowProtected],
          comments: [maintainerApprovalComment(["**", "*", "**/*", "*.ts"])],
        },
      ],
    });
    expect(catchAllResult.exempt).toBeNull();
    if (catchAllResult.exempt === null) {
      expect(catchAllResult.errors).toHaveLength(1);
    }

    const fencedBody = [
      "```md",
      '<!-- merit-proposal: {"paths":["vite.config.ts"]} -->',
      "```",
      '<!-- merit-proposal: {"paths":["docs/guides/testing.md"]} -->',
    ].join("\n");
    expect(parseProposalMarker(fencedBody)).toEqual({ paths: ["docs/guides/testing.md"] });
  });

  test("always rejects modifying or deleting an applied SQL migration even when approved", () => {
    for (const status of ["modified", "deleted"] as const) {
      const result = checkAgentPolicy({
        isAgentPr: true,
        changedFiles: [{ status, path: "foundation/db/database/migrations/0000_initial.sql" }],
        linkedIssues: [
          {
            number: 44,
            state: "OPEN",
            labels: [AGENT_LABELS.allowProtected],
            comments: [maintainerApprovalComment(["foundation/db/database/migrations/**"])],
          },
        ],
      });
      expect(result.exempt).toBeNull();
      if (result.exempt === null) {
        expect(result.errors).toEqual([
          expect.stringContaining("never modify or delete an applied SQL migration"),
        ]);
      }
    }
  });

  test("parses NUL-delimited git diff output including non-ASCII and renamed protected paths", () => {
    const raw = [
      "M",
      ".github/ISSUE_TEMPLATE/español.md",
      "R100",
      "foundation/db/database/migrations/0000_initial.sql",
      "foundation/db/database/migrations/0000_renamed.sql",
      "A",
      ".claude/.hidden.json",
      "",
    ].join("\0");

    const parsed = parseNameStatusZ(raw);
    expect(parsed).toEqual([
      { status: "modified", path: ".github/ISSUE_TEMPLATE/español.md" },
      { status: "deleted", path: "foundation/db/database/migrations/0000_initial.sql" },
      { status: "added", path: "foundation/db/database/migrations/0000_renamed.sql" },
      { status: "added", path: ".claude/.hidden.json" },
    ]);
    expect(findProtectedPaths(parsed.map((file) => file.path))).toEqual([
      ".claude/.hidden.json",
      ".github/ISSUE_TEMPLATE/español.md",
      "foundation/db/database/migrations/0000_initial.sql",
      "foundation/db/database/migrations/0000_renamed.sql",
    ]);
  });

  test("keeps the last proposal marker whose payload is a JSON object, normalizing its paths", () => {
    const body = [
      '<!-- merit-proposal: {"paths":["./docs\\\\a.md", "", 3, "docs/b.md"],"lens":"docs","kind":"pr","tier":1} -->',
      '<!-- merit-proposal: ["docs/array.md"] -->',
      "<!-- merit-proposal: {not json} -->",
    ].join("\n");
    expect(parseProposalMarker(body)).toEqual({
      paths: ["docs/a.md", "docs/b.md"],
      lens: "docs",
      kind: "pr",
    });
    expect(parseProposalMarker('<!-- merit-proposal: {"paths":"docs/a.md","lens":7} -->')).toEqual({
      paths: [],
    });
  });

  test("extracts linked issue numbers and imports only Node built-ins and sibling verification-record", () => {
    expect(extractLinkedIssueNumbers("Closes #42, fixes #17, and resolves #42")).toEqual([17, 42]);
    expect(parseProposalMarker("no marker here")).toBeNull();
    expect(parseProposalMarker("<!-- merit-proposal: {invalid json} -->")).toBeNull();

    const source = readFileSync(new URL("./agent-policy.ts", import.meta.url), "utf8");
    const specifiers = [...source.matchAll(/^import [^;]*? from "([^"]+)";$/gms)].map(
      ([, specifier]) => specifier,
    );
    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers.filter(
        (specifier) => !specifier?.startsWith("node:") && specifier !== "./verification-record.ts",
      ),
    ).toEqual([]);
  });
});
