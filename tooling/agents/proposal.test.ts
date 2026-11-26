import { describe, expect, test } from "vite-plus/test";

import type { IssueListItem, IssueListQuery } from "./github.ts";
import {
  applyTier2OnlyOverride,
  classifyProposalTier,
  fileProposal,
  findDuplicateProposal,
  isProposalCapReached,
  parseProposalArgs,
  proposalInputSchema,
  renderProposalMarkdown,
  selectProposalLabels,
  targetLabelForTier,
  type ProposalInput,
} from "./proposal.ts";

type PrProposalInput = Extract<ProposalInput, { kind: "pr" }>;

const sampleProposal = (overrides: Partial<PrProposalInput> = {}): PrProposalInput => {
  const parsed = proposalInputSchema.parse({
    lens: "tests",
    title: "Consolidate duplicate withdrawal assertions in reviews",
    why: "Three integration specs repeat identical withdrawal preconditions without adding new coverage.",
    evidence: "capabilities/reviews/business/tests/reviewer.integration.ts:110-180",
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

describe("proposal", () => {
  test("classifies unambiguous docs and single-slice pure-test proposals as Tier 1", () => {
    const docsResult = classifyProposalTier({
      paths: ["docs/guides/testing.md", "capabilities/reviews/business/README.md"],
      ambiguous: false,
    });
    expect(docsResult.tier).toBe(1);
    expect(targetLabelForTier(docsResult.tier)).toBe("agent:ready");

    const singleSliceTestResult = classifyProposalTier({
      paths: [
        "capabilities/reviews/business/src/domain/reviewer.test.ts",
        "capabilities/reviews/business/tests/reviewer.integration.ts",
      ],
      ambiguous: false,
    });
    expect(singleSliceTestResult.tier).toBe(1);
    expect(targetLabelForTier(singleSliceTestResult.tier)).toBe("agent:ready");
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
      const result = classifyProposalTier({ paths: [...paths], ambiguous });
      expect(result.tier, paths.join(",")).toBe(2);
      expect(targetLabelForTier(result.tier), paths.join(",")).toBe("agent:proposed");
    }
  });

  test("rejects workflow-controlled agent:* and comma-separated labels in extraLabels and enforces --tier2-only metadata consistency", () => {
    expect(() => sampleProposal({ extraLabels: ["agent:ready"] })).toThrow(/agent:\*/);
    expect(() => sampleProposal({ extraLabels: ["agent:allow-protected"] })).toThrow(/agent:\*/);
    expect(() => sampleProposal({ extraLabels: ["type:bug,agent:ready"] })).toThrow(/commas/);

    const proposal = sampleProposal();
    const base = classifyProposalTier({ paths: proposal.paths, ambiguous: false });
    expect(base.tier).toBe(1);

    const overridden = applyTier2OnlyOverride(base, true);
    expect(overridden.tier).toBe(2);
    expect(targetLabelForTier(overridden.tier)).toBe("agent:proposed");

    const markdown = renderProposalMarkdown(proposal, overridden);
    expect(markdown).toContain("`tier:2");
    expect(markdown).toContain('"tier":2');
    expect(markdown).not.toContain("allowProtectedPaths");
  });

  test("renders a compact above-the-fold Decision Card with collapsed Implementer Brief and metadata marker", () => {
    const proposal = sampleProposal();
    const classification = classifyProposalTier({
      paths: proposal.paths,
      ambiguous: proposal.ambiguous,
    });
    const markdown = renderProposalMarkdown(proposal, classification);
    const aboveFold = markdown.split("<details>")[0]?.trimEnd().split("\n") ?? [];

    expect(aboveFold.length).toBeLessThanOrEqual(12);
    expect(markdown).toContain("<summary>Implementer brief (for builder & reviewer)</summary>");
    expect(markdown).toContain("<!-- merit-proposal:");
    expect(markdown).toContain('"tier":1');
  });

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

    expect(isProposalCapReached(4)).toBe(false);
    expect(isProposalCapReached(5)).toBe(true);
  });

  test("classifies design proposals as Tier 2 and renders structured sequencing details instead of an implementer brief", () => {
    const designProposal = proposalInputSchema.parse({
      kind: "design",
      lens: "architecture",
      title: "Defer product route bundles behind lazy route loaders",
      why: "app/src/router.tsx eagerly pulls 634 modules (~1,671 KB) across all product routes.",
      evidence: "fallow entry-weight: app/src/router.tsx 634 eager modules, 2 deferred",
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
    expect(designProposal.kind).toBe("design");

    // Even docs-only paths stay Tier 2 when kind is "design".
    const classification = classifyProposalTier({
      paths: designProposal.paths,
      ambiguous: false,
      kind: designProposal.kind,
    });
    expect(classification.tier).toBe(2);
    expect(targetLabelForTier(classification.tier)).toBe("agent:proposed");

    const markdown = renderProposalMarkdown(designProposal, classification);
    expect(markdown).toContain("tier:2 · design · lens:architecture");
    expect(markdown).toContain(
      "<summary>Architecture design & sequencing (not auto-executed)</summary>",
    );
    expect(markdown).not.toContain("Implementer brief");
    expect(markdown).toContain('"kind":"design"');
  });

  test("deduplicates rephrased same-lens proposals targeting the same hotspot paths without false positives on unrelated work", () => {
    const existing = [
      {
        number: 240,
        title: "Decompose editable-review-work into controller and focused views",
        state: "OPEN" as const,
        labels: ["agent:proposed", "agent:design"],
        body: '<!-- merit-proposal: {"kind":"design","lens":"architecture","paths":["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx","capabilities/reviews/web/src/views/reviews/review-content.tsx"]} -->',
      },
    ];

    expect(
      findDuplicateProposal(
        {
          lens: "architecture",
          title: "Split editable-review-work view orchestration and rendering",
          paths: [
            "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx",
            "capabilities/reviews/web/src/views/reviews/review-content.tsx",
          ],
        },
        existing,
      ).duplicate,
    ).toBe(true);

    // Unrelated change on the same files under a different topic does not falsely deduplicate.
    expect(
      findDuplicateProposal(
        {
          lens: "security",
          title: "Sanitize external links rendered in review comments",
          paths: ["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx"],
        },
        existing,
      ).duplicate,
    ).toBe(false);

    // When an issue body contains multiple markers, lens and paths come from the same last valid marker.
    const multiMarkerIssue = [
      {
        number: 241,
        title: "Audit review editor permissions",
        state: "OPEN" as const,
        labels: ["agent:proposed"],
        body: [
          '<!-- merit-proposal: {"lens":"architecture","paths":["capabilities/reviews/web/src/views/reviews/old.tsx"]} -->',
          '<!-- merit-proposal: {"lens":"security","paths":["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx"]} -->',
        ].join("\n"),
      },
    ];
    expect(
      findDuplicateProposal(
        {
          lens: "architecture",
          title: "Decompose review editor layout",
          paths: ["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx"],
        },
        multiMarkerIssue,
      ).duplicate,
    ).toBe(false);
  });
});

describe("proposal arguments", () => {
  test("reads the input file, dry-run, and tier-2 override flags", () => {
    expect(parseProposalArgs([])).toEqual({ dryRun: false, tier2Only: false });
    expect(parseProposalArgs(["--file", "finding.json", "--dry-run", "--tier2-only"])).toEqual({
      file: "finding.json",
      dryRun: true,
      tier2Only: true,
    });
  });

  // A misspelt --dry-run must not fall through to filing a real GitHub issue.
  test.each([["--dry-rn"], ["--tier2only"], ["--dry-run", "extra"]])(
    "rejects %j before any GitHub call",
    (...args) => {
      expect(() => parseProposalArgs(args)).toThrow(/Usage: proposal\.ts/);
    },
  );

  test("rejects --file without a path", () => {
    expect(() => parseProposalArgs(["--file", "--dry-run"])).toThrow("--file requires a value.");
  });
});

describe("proposal labels", () => {
  test("labels a proposal with its tier's workflow label, design, maintenance, then its extras once each", () => {
    expect(selectProposalLabels(sampleProposal(), { tier: 1 })).toEqual([
      "agent:ready",
      "type:maintenance",
    ]);
    expect(
      selectProposalLabels(
        { kind: "design", extraLabels: ["area:reviews", "type:maintenance"] },
        { tier: 2 },
      ),
    ).toEqual(["agent:proposed", "agent:design", "type:maintenance", "area:reviews"]);
  });
});

const issue = (number: number, title: string, overrides: Partial<IssueListItem> = {}) => ({
  number,
  title,
  state: "OPEN" as const,
  body: "",
  labels: [],
  comments: [],
  ...overrides,
});

/** Answers issue list queries from `issuesFor` and records every query and created issue. */
const fakeIssues = (issuesFor: (query: IssueListQuery) => IssueListItem[] = () => []) => {
  const queries: IssueListQuery[] = [];
  const created: Array<{ title: string; body: string; labels: readonly string[] }> = [];
  const client = {
    listIssues: (query: IssueListQuery) => {
      queries.push(query);
      return issuesFor(query);
    },
    createIssue: (request: { title: string; body: string; labels: readonly string[] }) => {
      created.push(request);
      return "https://github.com/dmprav/merit/issues/400";
    },
  };
  return { client, queries, created };
};

describe("fileProposal", () => {
  test("files a Tier 1 proposal without consulting the Tier 2 cap", () => {
    const { client, queries, created } = fakeIssues();
    const proposal = sampleProposal();

    expect(fileProposal(client, proposal, { dryRun: false, tier2Only: false })).toEqual({
      status: "created",
      url: "https://github.com/dmprav/merit/issues/400",
      kind: "pr",
      tier: 1,
      targetLabel: "agent:ready",
      labels: ["agent:ready", "type:maintenance"],
    });
    expect(queries).toEqual([
      { state: "open" },
      { state: "closed", label: "wontfix" },
      { state: "closed", label: "duplicate" },
    ]);
    expect(created).toEqual([
      {
        title: proposal.title,
        body: renderProposalMarkdown(proposal, classifyProposalTier(proposal)),
        labels: ["agent:ready", "type:maintenance"],
      },
    ]);
  });

  test("renders a dry run, with the calibration override applied, without calling GitHub", () => {
    const { client, queries, created } = fakeIssues();

    const outcome = fileProposal(client, sampleProposal(), { dryRun: true, tier2Only: true });

    expect(outcome).toMatchObject({
      status: "dry_run",
      tier: 2,
      targetLabel: "agent:proposed",
      labels: ["agent:proposed", "type:maintenance"],
      reasons: ["calibration mode (--tier2-only)"],
    });
    expect(outcome.status === "dry_run" ? outcome.markdown : "").toContain("tier:2 · lens:tests");
    expect(queries).toEqual([]);
    expect(created).toEqual([]);
  });

  test("stops filing Tier 2 proposals once the open-proposal cap is reached", () => {
    const { client, created } = fakeIssues((query) =>
      query.label === "agent:proposed"
        ? [1, 2, 3, 4, 5].map((number) => issue(number, `Proposal ${number}`))
        : [],
    );

    expect(fileProposal(client, sampleProposal(), { dryRun: false, tier2Only: true })).toEqual({
      status: "cap_reached",
      openProposedCount: 5,
      maxOpenProposals: 5,
    });
    expect(created).toEqual([]);
  });

  test("reports an existing issue with the same title instead of filing a duplicate", () => {
    const proposal = sampleProposal();
    const { client, created } = fakeIssues((query) =>
      query.label === "wontfix"
        ? [issue(88, proposal.title, { state: "CLOSED", labels: ["wontfix"] })]
        : [],
    );

    expect(fileProposal(client, proposal, { dryRun: false, tier2Only: true })).toEqual({
      status: "duplicate",
      matchedIssue: 88,
      reason: "matches existing closed issue #88 title",
    });
    expect(created).toEqual([]);
  });
});
