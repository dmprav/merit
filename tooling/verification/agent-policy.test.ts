import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import {
  ALLOW_PROTECTED_LABEL,
  checkAgentPolicy,
  extractLinkedIssueNumbers,
  findProtectedPaths,
  parseProposalMarker,
} from "./agent-policy.ts";

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

  test("rejects unapproved, closed, wontfix, or still-proposed issues for protected paths", () => {
    const protectedFiles = [
      { status: "modified" as const, path: ".github/workflows/verify.yml" },
      { status: "modified" as const, path: "tooling/verification/verification-record.ts" },
      { status: "modified" as const, path: "tooling/agents/proposal.ts" },
      { status: "modified" as const, path: ".fallowrc.jsonc" },
      { status: "modified" as const, path: "capabilities/access/src/domain/policies.ts" },
    ];
    const body =
      '<!-- merit-proposal: {"paths":[".github/workflows/verify.yml","tooling/verification/**","tooling/agents/**",".fallowrc.jsonc","capabilities/access/src/**"]} -->';

    for (const badIssue of [
      { number: 1, state: "OPEN", labels: ["agent:ready"], body },
      { number: 2, state: "CLOSED", labels: [ALLOW_PROTECTED_LABEL], body },
      { number: 3, state: "OPEN", labels: [ALLOW_PROTECTED_LABEL, "wontfix"], body },
      { number: 4, state: "OPEN", labels: [ALLOW_PROTECTED_LABEL, "agent:proposed"], body },
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

  test("allows protected paths explicitly authorized by an OPEN maintainer-labeled issue", () => {
    const result = checkAgentPolicy({
      isAgentPr: true,
      changedFiles: [
        { status: "modified", path: "tooling/verification/lint.ts" },
        { status: "added", path: "foundation/db/database/migrations/0015_add_index.sql" },
      ],
      linkedIssues: [
        {
          number: 42,
          state: "OPEN",
          labels: ["agent:ready", ALLOW_PROTECTED_LABEL],
          body: '<!-- merit-proposal: {"paths":["tooling/verification/lint.ts","foundation/db/database/migrations/**"]} -->',
        },
      ],
    });
    expect(result).toEqual({ exempt: null, errors: [] });
  });

  test("rejects catch-all globs and fenced spoofed markers in proposal approvals", () => {
    const catchAllResult = checkAgentPolicy({
      isAgentPr: true,
      changedFiles: [{ status: "modified", path: "vite.config.ts" }],
      linkedIssues: [
        {
          number: 43,
          state: "OPEN",
          labels: [ALLOW_PROTECTED_LABEL],
          body: '<!-- merit-proposal: {"paths":["**","*","**/*","*.ts"]} -->',
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

  test("always rejects modifying, deleting, or renaming an applied SQL migration even when approved", () => {
    for (const status of ["modified", "deleted"] as const) {
      const result = checkAgentPolicy({
        isAgentPr: true,
        changedFiles: [{ status, path: "foundation/db/database/migrations/0000_initial.sql" }],
        linkedIssues: [
          {
            number: 44,
            state: "OPEN",
            labels: [ALLOW_PROTECTED_LABEL],
            body: '<!-- merit-proposal: {"paths":["foundation/db/database/migrations/**"]} -->',
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

  test("extracts linked issue numbers and detects all protected paths", () => {
    expect(extractLinkedIssueNumbers("Closes #42, fixes #17, and resolves #42")).toEqual([17, 42]);
    expect(
      findProtectedPaths([
        "README.md",
        "./vite.config.ts",
        ".agents/hooks/guard.mjs",
        ".fallowrc.jsonc",
        "tooling/agents/queue.ts",
        "tooling/verification/verification-record.ts",
      ]),
    ).toEqual([
      ".agents/hooks/guard.mjs",
      ".fallowrc.jsonc",
      "tooling/agents/queue.ts",
      "tooling/verification/verification-record.ts",
      "vite.config.ts",
    ]);
    expect(parseProposalMarker("no marker here")).toBeNull();
    expect(parseProposalMarker("<!-- merit-proposal: {invalid json} -->")).toBeNull();
  });

  test("imports only Node built-ins and sibling verification-record so CI runs before install", () => {
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
