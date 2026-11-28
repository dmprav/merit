import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import type { IssueListItem, IssueListQuery } from "./github.ts";
import {
  classifyProposalTier,
  fileProposal,
  findDuplicateProposal,
  parseProposalArgs,
  proposalInputSchema,
  type ProposalEvidence,
  type ProposalInput,
  renderProposalMarkdown,
  resolveProposalDepth,
  selectProposalLabels,
  targetLabelFor,
  verifyEvidenceBranch,
} from "./proposal.ts";

type PrProposalInput = Extract<ProposalInput, { kind: "pr" }>;

const failingTestEvidence = {
  type: "failing-test",
  command: "vp run @merit/reviews#test -- reviewer.test.ts",
  output: "FAIL reviewer.test.ts > withdraws once\nAssertionError: expected 2 to be 1",
  citations: ["capabilities/reviews/business/src/domain/reviewer.ts:42"],
  branch: "claude/scout-reviews",
  commit: "abc1234",
} as const;

const commandEvidence = {
  type: "command",
  command: "vp run architecture",
  output: "serverImports: capabilities/reviews imports capabilities/rounds",
  citations: ["capabilities/reviews/business/src/server/service.ts:12"],
} as const;

const sampleProposal = (overrides: Record<string, unknown> = {}): PrProposalInput => {
  const parsed = proposalInputSchema.parse({
    run: "area:capabilities/reviews",
    title: "Consolidate duplicate withdrawal assertions in reviews",
    why: "Three integration specs repeat identical withdrawal preconditions without adding new coverage.",
    evidence: commandEvidence,
    change: [
      "Collapse the three repeated withdrawal cases into one table-driven test",
      "Keep all existing outcome assertions intact",
    ],
    decision: "None — unambiguous test consolidation preserving every assertion.",
    whyNot: "Keeping separate tests slightly eases reading each case in isolation.",
    paths: ["capabilities/reviews/business/tests/reviewer.integration.ts"],
    brief: {
      behavior: ["Preserve every withdrawal precondition and error assertion."],
      outOfScope: ["Do not change production review logic."],
      precedents: ["capabilities/reviews/business/tests/reviewer.integration.ts"],
      plan: [
        "Consolidate duplicate cases in capabilities/reviews/business/tests/reviewer.integration.ts.",
      ],
      verification: ["vp run @merit/reviews#test"],
    },
    ...overrides,
  });
  if (parsed.kind !== "pr") {
    throw new Error("Expected pr proposal fixture.");
  }
  return parsed;
};

const issue = (number: number, title: string, overrides: Partial<IssueListItem> = {}) => ({
  number,
  title,
  state: "OPEN" as const,
  body: "",
  labels: [],
  comments: [],
  ...overrides,
});

const markerBody = (marker: Record<string, unknown>) =>
  `Body.\n\n<!-- merit-proposal: ${JSON.stringify({ paths: ["docs/a.md"], ...marker })} -->`;

/** Answers issue list queries and views, and records every query and created issue. */
const fakeIssues = ({
  issuesFor = () => [],
  bodies = {},
}: {
  issuesFor?: (query: IssueListQuery) => IssueListItem[];
  bodies?: Record<number, string>;
} = {}) => {
  const queries: IssueListQuery[] = [];
  const viewed: number[] = [];
  const created: Array<{ title: string; body: string; labels: readonly string[] }> = [];
  const client = {
    listIssues: (query: IssueListQuery) => {
      queries.push(query);
      return issuesFor(query);
    },
    viewIssue: (number: number) => {
      viewed.push(number);
      const body = bodies[number];
      if (body === undefined) {
        throw new Error(`gh: Not Found (#${number})`);
      }
      return { number, state: "OPEN", title: `Issue ${number}`, body };
    },
    createIssue: (request: { title: string; body: string; labels: readonly string[] }) => {
      created.push(request);
      return "https://github.com/dmprav/merit/issues/400";
    },
  };
  return { client, queries, viewed, created };
};

const acceptEvidence = () => {
  const checked: ProposalEvidence[] = [];
  return { checked, verifyEvidence: (evidence: ProposalEvidence) => void checked.push(evidence) };
};

describe("proposal input", () => {
  test("requires exactly one source: a scout run or a parent", () => {
    expect(() => sampleProposal({ run: undefined })).toThrow(/exactly one source/);
    expect(() => sampleProposal({ parent: { type: "issue", number: 12 } })).toThrow(
      /exactly one source/,
    );
    expect(sampleProposal({ run: undefined, parent: { type: "pr", number: 12 } }).parent).toEqual({
      type: "pr",
      number: 12,
    });
  });

  test.each(["lens-docs", "area:", "mechanism:"])("rejects the run id %j", (run) => {
    expect(() => sampleProposal({ run })).toThrow(/run id/);
  });

  test.each(["change-batch", "records", "area:tooling/agents", "mechanism:audit-trail"])(
    "accepts the run id %j",
    (run) => {
      expect(sampleProposal({ run }).run).toBe(run);
    },
  );

  test("requires evidence as an object with a command, output, and file:line citations", () => {
    expect(() => sampleProposal({ evidence: "capabilities/a.ts:1" })).toThrow();
    expect(() => sampleProposal({ evidence: { ...commandEvidence, citations: [] } })).toThrow();
    expect(() =>
      sampleProposal({ evidence: { ...commandEvidence, citations: ["no line number"] } }),
    ).toThrow(/file:line/);
    expect(() => sampleProposal({ evidence: { ...commandEvidence, output: "" } })).toThrow();
    expect(() =>
      sampleProposal({ evidence: { ...commandEvidence, output: "x".repeat(1501) } }),
    ).toThrow();
    expect(
      sampleProposal({ evidence: { ...commandEvidence, output: "x".repeat(1500) } }).evidence
        .output,
    ).toHaveLength(1500);
  });

  test("requires a failing test's branch and commit, and accepts them as optional otherwise", () => {
    const { branch: _branch, ...withoutBranch } = failingTestEvidence;
    const { commit: _commit, ...withoutCommit } = failingTestEvidence;
    expect(() => sampleProposal({ evidence: withoutBranch })).toThrow(/evidence branch/);
    expect(() => sampleProposal({ evidence: withoutCommit })).toThrow(/evidence branch/);
    expect(sampleProposal({ evidence: failingTestEvidence }).evidence.commit).toBe("abc1234");
    expect(
      sampleProposal({
        evidence: { ...commandEvidence, type: "surviving-mutation" },
      }).evidence.type,
    ).toBe("surviving-mutation");
  });

  test.each(["--upload-pack=x", "a..b", "has space", ""])(
    "rejects the evidence branch %j",
    (branch) => {
      expect(() => sampleProposal({ evidence: { ...failingTestEvidence, branch } })).toThrow();
    },
  );

  test("rejects workflow-controlled agent:* and comma-separated labels in extraLabels", () => {
    expect(() => sampleProposal({ extraLabels: ["agent:ready"] })).toThrow(/agent:\*/);
    expect(() => sampleProposal({ extraLabels: ["agent:allow-protected"] })).toThrow(/agent:\*/);
    expect(() => sampleProposal({ extraLabels: ["type:bug,agent:ready"] })).toThrow(/commas/);
  });
});

describe("tier classification", () => {
  test("classifies unambiguous docs and single-slice pure-test proposals as Tier 1", () => {
    expect(
      classifyProposalTier({
        paths: ["docs/guides/testing.md", "capabilities/reviews/business/README.md"],
        ambiguous: false,
      }).tier,
    ).toBe(1);
    expect(
      classifyProposalTier({
        paths: [
          "capabilities/reviews/business/src/domain/reviewer.test.ts",
          "capabilities/reviews/business/tests/reviewer.integration.ts",
        ],
        ambiguous: false,
      }).tier,
    ).toBe(1);
  });

  test("treats each tooling package as its own slice", () => {
    const tier = (paths: string[]) => classifyProposalTier({ paths, ambiguous: false }).tier;

    expect(tier(["tooling/testing/process.test.ts", "tooling/testing/env.test.ts"])).toBe(1);
    expect(tier(["tooling/testing/process.test.ts", "tooling/stylelint/rules.test.ts"])).toBe(2);
    expect(
      classifyProposalTier({
        paths: ["tooling/testing/process.test.ts", "tooling/stylelint/rules.test.ts"],
        ambiguous: false,
      }).slices,
    ).toEqual(["tooling/stylelint", "tooling/testing"]);
  });

  test("classifies production, multi-slice, extends-mechanism, protected, root/record docs, wildcard, or ambiguous proposals as Tier 2", () => {
    for (const [paths, ambiguous] of [
      [["capabilities/reviews/business/src/server/service.ts"], false],
      [
        [
          "capabilities/reviews/business/src/domain/reviewer.test.ts",
          "capabilities/rounds/business/src/domain/round.test.ts",
        ],
        false,
      ],
      // Single-slice pure test touching an `extends` mechanism contract must be Tier 2.
      [["foundation/money/src/money.test.ts"], false],
      [["docs/workflows/participate-in-review.md"], true],
      [["tooling/verification/lint.ts"], false],
      [["verifications/217.md"], false],
      [[".remarkrc.mjs"], false],
      [["AGENTS.md"], false],
      [["docs/guides/*.md"], false],
    ] as const) {
      expect(classifyProposalTier({ paths: [...paths], ambiguous }).tier, paths.join(",")).toBe(2);
    }
  });

  test("classifies design proposals as Tier 2 even for docs-only paths", () => {
    expect(
      classifyProposalTier({
        paths: ["docs/foundations/architecture.md"],
        ambiguous: false,
        kind: "design",
      }).tier,
    ).toBe(2);
  });
});

describe("rendered proposal", () => {
  const classify = (proposal: ProposalInput) =>
    classifyProposalTier({
      paths: proposal.paths,
      ambiguous: proposal.ambiguous,
      kind: proposal.kind,
    });

  test("renders the Evidence section with the command, output, and citations, and a marker recording the run", () => {
    const proposal = sampleProposal();
    const markdown = renderProposalMarkdown(proposal, classify(proposal), 0);

    expect(markdown).toContain("**Evidence:** command");
    expect(markdown).toContain(
      "```text\n$ vp run architecture\nserverImports: capabilities/reviews imports capabilities/rounds\n```",
    );
    expect(markdown).toContain("- `capabilities/reviews/business/src/server/service.ts:12`");
    expect(markdown).toContain("run:area:capabilities/reviews · depth:0");
    expect(markdown).not.toContain("git cherry-pick");
    expect(markdown).toContain("<summary>Implementer brief (for builder & reviewer)</summary>");
    expect(markdown).toContain(
      '<!-- merit-proposal: {"kind":"pr","run":"area:capabilities/reviews","depth":0,"tier":1,"paths":["capabilities/reviews/business/tests/reviewer.integration.ts"],"evidence":{"type":"command"}} -->',
    );
  });

  test("tells a builder how to pick up a failing test from its evidence branch", () => {
    const proposal = sampleProposal({ evidence: failingTestEvidence });
    const markdown = renderProposalMarkdown(proposal, classify(proposal), 0);

    expect(markdown).toContain("**Evidence:** failing-test");
    expect(markdown).toContain("Branch `claude/scout-reviews`, commit `abc1234`.");
    expect(markdown).toContain(
      "`git fetch origin claude/scout-reviews && git cherry-pick abc1234`",
    );
    expect(markdown).toContain(
      '"evidence":{"type":"failing-test","branch":"claude/scout-reviews","commit":"abc1234"}',
    );
  });

  test("records a follow-up's parent and depth, and fences output that contains backticks", () => {
    const proposal = sampleProposal({
      run: undefined,
      parent: { type: "pr", number: 412 },
      evidence: { ...commandEvidence, output: "```ts\nconst a = 1;\n```" },
    });
    const markdown = renderProposalMarkdown(proposal, classify(proposal), 2);

    expect(markdown).toContain("parent:PR #412 · depth:2");
    expect(markdown).toContain('"parent":{"type":"pr","number":412},"depth":2');
    expect(markdown).toContain("````text\n$ vp run architecture\n```ts\nconst a = 1;\n```\n````");
  });

  test("renders structured sequencing details for a design instead of an implementer brief", () => {
    const designProposal = proposalInputSchema.parse({
      kind: "design",
      run: "area:app",
      title: "Defer product route bundles behind lazy route loaders",
      why: "app/src/router.tsx eagerly pulls 634 modules (~1,671 KB) across all product routes.",
      evidence: {
        type: "command",
        command: "fallow entry-weight",
        output: "app/src/router.tsx 634 eager modules, 2 deferred",
        citations: ["app/src/router.tsx:1"],
      },
      change: [
        "Split heavy product capability routes onto lazy route imports",
        "Keep shared workspace shell synchronous while deferring leaf editors",
      ],
      decision: "Needs agreement on route-split boundaries before touching 15+ route modules.",
      whyNot: "Keeping all routes eager slows initial page load for every user.",
      paths: ["docs/foundations/architecture.md"],
      design: {
        options: [
          "Option A: TanStack Router lazy route files per product feature",
          "Option B: Split only heavy review/intake editors via dynamic import",
        ],
        recommendation: "Option A aligns with TanStack Router code-splitting conventions.",
        prSequence: [
          "PR 1: Split review and intake editor routes and add entry-weight check",
          "PR 2: Migrate remaining product workspace routes",
        ],
        openQuestions: ["Should admin routes split in the same sequence or separately?"],
      },
    });
    const markdown = renderProposalMarkdown(designProposal, classify(designProposal), 0);

    expect(markdown).toContain("tier:2 · design · run:area:app");
    expect(markdown).toContain(
      "<summary>Architecture design & sequencing (not auto-executed)</summary>",
    );
    expect(markdown).not.toContain("Implementer brief");
    expect(markdown).toContain('"kind":"design"');
  });
});

describe("duplicate detection", () => {
  test("deduplicates accurately without false positives on disjoint paths or short-token titles", () => {
    const proposal = sampleProposal();

    expect(
      findDuplicateProposal(proposal, [
        {
          number: 99,
          title: "Consolidate duplicate withdrawal assertions in reviews",
          state: "CLOSED",
          labels: ["wontfix"],
        },
      ]).duplicate,
    ).toBe(true);

    expect(
      findDuplicateProposal(proposal, [
        {
          number: 105,
          title: "Consolidate repeated withdrawal assertions in reviews",
          state: "OPEN",
          labels: ["agent:proposed"],
          body: '<!-- merit-proposal: {"paths":["capabilities/reviews/business/tests/reviewer.integration.ts"]} -->',
        },
      ]).duplicate,
    ).toBe(true);

    // Same similarity, but disjoint proposal paths should not deduplicate.
    expect(
      findDuplicateProposal(proposal, [
        {
          number: 106,
          title: "Consolidate repeated withdrawal assertions in reviews",
          state: "OPEN",
          labels: ["agent:proposed"],
          body: '<!-- merit-proposal: {"paths":["capabilities/rounds/business/tests/round.integration.ts"]} -->',
        },
      ]).duplicate,
    ).toBe(false);

    // Short-word titles with zero >=3-char tokens must not falsely match.
    expect(
      findDuplicateProposal({ title: "UI DB", paths: ["docs/guides/ui.md"] }, [
        { number: 107, title: "QA CI", state: "OPEN", labels: ["agent:proposed"] },
      ]).duplicate,
    ).toBe(false);

    // Ordinary closed issues without wontfix/duplicate do not block re-filing.
    expect(
      findDuplicateProposal(proposal, [
        {
          number: 50,
          title: "Consolidate duplicate withdrawal assertions in reviews",
          state: "CLOSED",
          labels: ["type:maintenance"],
        },
      ]).duplicate,
    ).toBe(false);
  });

  test("deduplicates rephrased proposals targeting the same paths without false positives on unrelated work", () => {
    const existing = [
      {
        number: 240,
        title: "Decompose editable-review-work into controller and focused views",
        state: "OPEN" as const,
        labels: ["agent:proposed", "agent:design"],
        body: '<!-- merit-proposal: {"kind":"design","run":"area:capabilities/reviews","paths":["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx","capabilities/reviews/web/src/views/reviews/review-content.tsx"]} -->',
      },
    ];

    expect(
      findDuplicateProposal(
        {
          title: "Split editable-review-work view orchestration and rendering",
          paths: [
            "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx",
            "capabilities/reviews/web/src/views/reviews/review-content.tsx",
          ],
        },
        existing,
      ).duplicate,
    ).toBe(true);

    // Unrelated change on the same file under a different topic does not falsely deduplicate.
    expect(
      findDuplicateProposal(
        {
          title: "Sanitize external links rendered in review comments",
          paths: ["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx"],
        },
        existing,
      ).duplicate,
    ).toBe(false);

    // When an issue body contains multiple markers, paths come from the last valid marker.
    const multiMarkerIssue = [
      {
        number: 241,
        title: "Audit review editor permissions",
        state: "OPEN" as const,
        labels: ["agent:proposed"],
        body: [
          '<!-- merit-proposal: {"paths":["capabilities/reviews/web/src/views/reviews/old.tsx"]} -->',
          '<!-- merit-proposal: {"paths":["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx"]} -->',
        ].join("\n"),
      },
    ];
    expect(
      findDuplicateProposal(
        {
          title: "Decompose review editor layout",
          paths: ["capabilities/reviews/web/src/views/reviews/old.tsx"],
        },
        multiMarkerIssue,
      ).duplicate,
    ).toBe(false);
  });
});

describe("proposal arguments", () => {
  test("reads the input file and dry-run flags", () => {
    expect(parseProposalArgs([])).toEqual({ dryRun: false });
    expect(parseProposalArgs(["--file", "finding.json", "--dry-run"])).toEqual({
      file: "finding.json",
      dryRun: true,
    });
  });

  // A misspelt --dry-run must not fall through to filing a real GitHub issue.
  test.each([["--dry-rn"], ["--tier2-only"], ["--dry-run", "extra"]])(
    "rejects %j before any GitHub call",
    (...args) => {
      expect(() => parseProposalArgs(args)).toThrow(/Usage: proposal\.ts/);
    },
  );

  test("rejects --file without a path", () => {
    expect(() => parseProposalArgs(["--file", "--dry-run"])).toThrow("--file requires a value.");
  });

  // An empty path must not fall back to reading a different proposal from stdin.
  test.each([[["--file="]], [["--file", "finding.json", "--file="]]])(
    "rejects an empty --file path in %j",
    (args) => {
      expect(() => parseProposalArgs(args)).toThrow("--file requires a value.");
    },
  );
});

describe("proposal labels", () => {
  test("marks a pull request proposal ready up to depth 2 unless it is ambiguous", () => {
    const pr = { kind: "pr", ambiguous: false } as const;
    expect(targetLabelFor(pr, 0)).toBe("agent:ready");
    expect(targetLabelFor(pr, 2)).toBe("agent:ready");
    expect(targetLabelFor(pr, 3)).toBe("agent:proposed");
    expect(targetLabelFor({ kind: "pr", ambiguous: true }, 0)).toBe("agent:proposed");
    expect(targetLabelFor({ kind: "design", ambiguous: false }, 0)).toBe("agent:proposed");
  });

  test("labels a proposal with ready or proposed, design, maintenance, then its extras once each", () => {
    expect(selectProposalLabels(sampleProposal(), 0)).toEqual(["agent:ready", "type:maintenance"]);
    expect(
      selectProposalLabels(
        { kind: "design", ambiguous: false, extraLabels: ["area:reviews", "type:maintenance"] },
        0,
      ),
    ).toEqual(["agent:proposed", "agent:design", "type:maintenance", "area:reviews"]);
  });
});

describe("proposal depth", () => {
  test("is 0 for a scout finding without reading any issue", () => {
    const { client, viewed } = fakeIssues();
    expect(resolveProposalDepth(client, sampleProposal())).toBe(0);
    expect(viewed).toEqual([]);
  });

  test("is one more than the parent issue's marker depth, counting an unmarked issue as depth 0", () => {
    const { client } = fakeIssues({
      bodies: {
        10: markerBody({ run: "records", depth: 0 }),
        11: markerBody({ depth: 2 }),
        12: "Plain issue.",
      },
    });

    const followUp = (number: number) =>
      sampleProposal({ run: undefined, parent: { type: "issue", number } });

    expect(resolveProposalDepth(client, followUp(10))).toBe(1);
    expect(resolveProposalDepth(client, followUp(11))).toBe(3);
    expect(resolveProposalDepth(client, followUp(12))).toBe(1);
  });

  test("follows a parent pull request to the issue it closes, else counts depth 1", () => {
    const { client, viewed } = fakeIssues({
      bodies: {
        20: "Adds the fix.\n\nCloses #21",
        21: markerBody({ depth: 1 }),
        22: "No linked issue here.",
      },
    });

    const followUp = (number: number) =>
      sampleProposal({ run: undefined, parent: { type: "pr", number } });

    expect(resolveProposalDepth(client, followUp(20))).toBe(2);
    expect(viewed).toEqual([20, 21]);
    expect(resolveProposalDepth(client, followUp(22))).toBe(1);
  });

  test("follows the first issue a pull request closes in body order, not the lowest number", () => {
    const { client, viewed } = fakeIssues({
      bodies: {
        30: "Refs #5. closed #32 and Fixes #6, then Closes #31",
        31: markerBody({ depth: 0 }),
        32: markerBody({ depth: 2 }),
      },
    });
    expect(
      resolveProposalDepth(
        client,
        sampleProposal({ run: undefined, parent: { type: "pr", number: 30 } }),
      ),
    ).toBe(3);
    expect(viewed).toEqual([30, 32]);
  });

  test("fails when the parent cannot be read", () => {
    const { client } = fakeIssues();
    expect(() =>
      resolveProposalDepth(
        client,
        sampleProposal({ run: undefined, parent: { type: "issue", number: 99 } }),
      ),
    ).toThrow("Not Found");
  });
});

describe("fileProposal", () => {
  test("files a scout finding as ready after checking its evidence, with a computed depth", () => {
    const { client, queries, created } = fakeIssues();
    const { checked, verifyEvidence } = acceptEvidence();
    const proposal = sampleProposal({ evidence: failingTestEvidence });

    expect(fileProposal(client, proposal, { dryRun: false, verifyEvidence })).toEqual({
      status: "created",
      url: "https://github.com/dmprav/merit/issues/400",
      kind: "pr",
      depth: 0,
      tier: 1,
      targetLabel: "agent:ready",
      labels: ["agent:ready", "type:maintenance"],
    });
    expect(checked).toEqual([proposal.evidence]);
    expect(queries).toEqual([
      { state: "open" },
      { state: "closed", label: "wontfix" },
      { state: "closed", label: "duplicate" },
    ]);
    expect(created).toEqual([
      {
        title: proposal.title,
        body: renderProposalMarkdown(proposal, classifyProposalTier(proposal), 0),
        labels: ["agent:ready", "type:maintenance"],
      },
    ]);
  });

  test("holds a follow-up three steps from its finding for the maintainer", () => {
    const { client, created } = fakeIssues({ bodies: { 30: markerBody({ depth: 2 }) } });
    const { verifyEvidence } = acceptEvidence();
    const proposal = sampleProposal({ run: undefined, parent: { type: "issue", number: 30 } });

    expect(fileProposal(client, proposal, { dryRun: false, verifyEvidence })).toMatchObject({
      status: "created",
      depth: 3,
      targetLabel: "agent:proposed",
      labels: ["agent:proposed", "type:maintenance"],
    });
    expect(created).toHaveLength(1);
  });

  test("files nothing when the evidence commit is not on its branch", () => {
    const { client, queries, created } = fakeIssues();

    const verifyEvidence = () => {
      throw new Error("Evidence commit abc1234 is not reachable from origin/claude/scout-reviews.");
    };

    expect(() =>
      fileProposal(client, sampleProposal({ evidence: failingTestEvidence }), {
        dryRun: false,
        verifyEvidence,
      }),
    ).toThrow("not reachable");
    expect(queries).toEqual([]);
    expect(created).toEqual([]);
  });

  test("renders a dry run without listing or creating issues, still checking the evidence", () => {
    const { client, queries, created } = fakeIssues();
    const { checked, verifyEvidence } = acceptEvidence();

    const outcome = fileProposal(client, sampleProposal(), { dryRun: true, verifyEvidence });

    expect(outcome).toMatchObject({
      status: "dry_run",
      depth: 0,
      tier: 1,
      targetLabel: "agent:ready",
      labels: ["agent:ready", "type:maintenance"],
    });
    expect(outcome.status === "dry_run" ? outcome.markdown : "").toContain(
      "tier:1 · run:area:capabilities/reviews",
    );
    expect(checked).toHaveLength(1);
    expect(queries).toEqual([]);
    expect(created).toEqual([]);
  });

  test("reports an existing issue with the same title instead of filing a duplicate", () => {
    const proposal = sampleProposal();
    const { client, created } = fakeIssues({
      issuesFor: (query) =>
        query.label === "wontfix"
          ? [issue(88, proposal.title, { state: "CLOSED", labels: ["wontfix"] })]
          : [],
    });
    const { verifyEvidence } = acceptEvidence();

    expect(fileProposal(client, proposal, { dryRun: false, verifyEvidence })).toEqual({
      status: "duplicate",
      matchedIssue: 88,
      reason: "matches existing closed issue #88 title",
    });
    expect(created).toEqual([]);
  });
});

describe("evidence branch verification", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

  /**
   * A clone of `origin` taken before `claude/evidence` was pushed, so the evidence commit reaches the
   * clone only through the fetch `verifyEvidenceBranch` runs. `otherCommit` is already in the clone.
   */
  const withOrigin = (
    run: (clone: string, evidenceCommit: string, otherCommit: string) => void,
  ) => {
    const root = mkdtempSync(join(tmpdir(), "merit-evidence-"));
    try {
      const origin = join(root, "origin");
      const clone = join(root, "clone");
      mkdirSync(origin);
      git(origin, "init", "-q", "-b", "main");
      git(origin, "config", "user.email", "scout@example.com");
      git(origin, "config", "user.name", "Scout");
      writeFileSync(join(origin, "a.txt"), "a");
      git(origin, "add", ".");
      git(origin, "commit", "-q", "-m", "base");
      writeFileSync(join(origin, "c.txt"), "c");
      git(origin, "add", ".");
      git(origin, "commit", "-q", "-m", "unrelated");
      const otherCommit = git(origin, "rev-parse", "HEAD");
      git(root, "clone", "-q", origin, clone);

      git(origin, "switch", "-q", "-c", "claude/evidence", "HEAD~1");
      writeFileSync(join(origin, "b.txt"), "b");
      git(origin, "add", ".");
      git(origin, "commit", "-q", "-m", "failing test");
      const evidenceCommit = git(origin, "rev-parse", "HEAD");
      expect(() => git(clone, "cat-file", "-e", `${evidenceCommit}^{commit}`)).toThrow();
      run(clone, evidenceCommit, otherCommit);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  test("accepts a commit reachable from the fetched origin branch", () => {
    withOrigin((clone, evidenceCommit) => {
      expect(() =>
        verifyEvidenceBranch(clone, { branch: "claude/evidence", commit: evidenceCommit }),
      ).not.toThrow();
    });
  });

  test("refuses a commit that is not on the branch, a branch that does not exist, or an unknown commit", () => {
    withOrigin((clone, evidenceCommit, otherCommit) => {
      expect(() =>
        verifyEvidenceBranch(clone, { branch: "claude/evidence", commit: otherCommit }),
      ).toThrow(/not reachable from origin\/claude\/evidence/);
      expect(() =>
        verifyEvidenceBranch(clone, { branch: "claude/missing", commit: evidenceCommit }),
      ).toThrow(/not reachable from origin\/claude\/missing/);
      expect(() =>
        verifyEvidenceBranch(clone, { branch: "claude/evidence", commit: "0".repeat(40) }),
      ).toThrow(/not reachable/);
    });
  });

  test("has nothing to check for evidence without a branch and commit", () => {
    expect(() => verifyEvidenceBranch("/nonexistent", {})).not.toThrow();
  });
});
