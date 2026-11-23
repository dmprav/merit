import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import {
  applyTier2OnlyOverride,
  classifyProposalTier,
  findDuplicateProposal,
  isProposalCapReached,
  proposalInputSchema,
  renderProposalMarkdown,
  resolveScoutGhEnv,
  SCOUT_GH_TOKEN_ENV,
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
    expect(docsResult.targetLabel).toBe("agent:ready");

    const singleSliceTestResult = classifyProposalTier({
      paths: [
        "capabilities/reviews/business/src/domain/reviewer.test.ts",
        "capabilities/reviews/business/tests/reviewer.integration.ts",
      ],
      ambiguous: false,
    });
    expect(singleSliceTestResult.tier).toBe(1);
    expect(singleSliceTestResult.targetLabel).toBe("agent:ready");
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
      expect(result.targetLabel, paths.join(",")).toBe("agent:proposed");
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
    expect(overridden.targetLabel).toBe("agent:proposed");

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

  test("prefers MERIT_SCOUT_GH_TOKEN over injected GH_TOKEN without mutating input env", () => {
    const baseEnv = { GH_TOKEN: "injected-integration-token", PATH: "/usr/bin" };
    expect(resolveScoutGhEnv(baseEnv)).toBe(baseEnv);
    expect(resolveScoutGhEnv({ ...baseEnv, [SCOUT_GH_TOKEN_ENV]: "   " })).toEqual({
      ...baseEnv,
      [SCOUT_GH_TOKEN_ENV]: "   ",
    });

    const withScoutToken = {
      ...baseEnv,
      [SCOUT_GH_TOKEN_ENV]: "  scout-token-fixture  ",
    };
    const resolved = resolveScoutGhEnv(withScoutToken);
    expect(resolved.GH_TOKEN).toBe("scout-token-fixture");
    expect(resolved.PATH).toBe("/usr/bin");
    expect(withScoutToken.GH_TOKEN).toBe("injected-integration-token");
  });

  test("routes every gh CLI invocation in proposal.ts and scout.ts through runScoutGh", () => {
    const proposalSource = readFileSync(
      fileURLToPath(new URL("./proposal.ts", import.meta.url)),
      "utf8",
    );
    const scoutSource = readFileSync(fileURLToPath(new URL("./scout.ts", import.meta.url)), "utf8");

    expect(proposalSource.match(/execFileSync\("gh"/g)).toHaveLength(1);
    expect(scoutSource).not.toMatch(/execFileSync\("gh"/);
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
    expect(classification.targetLabel).toBe("agent:proposed");

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
  });
});
