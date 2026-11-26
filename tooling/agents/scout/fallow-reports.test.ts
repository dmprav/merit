import { describe, expect, test } from "vite-plus/test";

import {
  summarizeEntryWeights,
  summarizeFallowDupes,
  summarizeFallowHealth,
} from "./fallow-reports.ts";
import { buildTrackedPathsIndex } from "./tracked-issues.ts";

const REVIEW_WORK = "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx";

const trackedPathsByIssue = buildTrackedPathsIndex([
  {
    number: 240,
    body: `<!-- merit-proposal: {"kind":"design","lens":"architecture","paths":["${REVIEW_WORK}","app/src/router.tsx"]} -->`,
  },
  {
    number: 243,
    body: '<!-- merit-proposal: {"kind":"design","lens":"architecture","paths":["app/src"]} -->',
  },
]);

const fileScore = (path: string, overrides: { fan_out?: number; lines?: number } = {}) => ({
  path,
  fan_in: 1,
  fan_out: overrides.fan_out ?? 1,
  lines: overrides.lines ?? 100,
  function_count: 5,
  total_cyclomatic: 10,
  total_cognitive: 5,
});

describe("fallow health summary", () => {
  test("excludes test and fixture files from top files and hotspots", () => {
    const fixture = "interfaces/product/src/features/grantmaking/testing/intake.story-fixtures.tsx";
    const health = summarizeFallowHealth({
      rawHealth: {
        file_scores: [fileScore(fixture, { fan_out: 40, lines: 900 }), fileScore(REVIEW_WORK)],
        hotspots: [{ path: fixture, score: 99, commits: 9, trend: "heating" }],
      },
      pathPatterns: [],
      trackedPathsByIssue,
    });
    expect(health.topFiles.map((entry) => entry.path)).toEqual([REVIEW_WORK]);
    expect(health.hotspots).toEqual([]);
  });

  test("ranks axis files ahead of heavier files outside the axis and tags tracking issues", () => {
    const outside = "foundation/ui/src/table.tsx";
    const health = summarizeFallowHealth({
      rawHealth: {
        file_scores: [fileScore(outside, { fan_out: 50, lines: 900 }), fileScore(REVIEW_WORK)],
      },
      pathPatterns: ["capabilities/*/web/src/**"],
      trackedPathsByIssue,
    });
    expect(
      health.topFiles.map(({ path, inAxis, trackedBy }) => ({ path, inAxis, trackedBy })),
    ).toEqual([
      { path: REVIEW_WORK, inAxis: true, trackedBy: [240] },
      { path: outside, inAxis: false, trackedBy: [] },
    ]);
  });

  test("rounds hotspot scores and keeps only active threshold overrides", () => {
    const health = summarizeFallowHealth({
      rawHealth: {
        hotspots: [{ path: REVIEW_WORK, score: 71.26, commits: 6, trend: "heating" }],
        threshold_overrides: [
          {
            status: "active",
            path: "capabilities/reviews/web/src/controllers/reviewer/use-reviewer.ts",
            function: "useReviewer",
            line: 127,
            metrics: { cognitive: 20, line_count: 302 },
            reason: "Shared session closures.",
          },
          { status: "stale", path: "foundation/ui/src/old.ts" },
        ],
      },
      pathPatterns: [],
      trackedPathsByIssue,
    });
    expect(health.hotspots).toEqual([
      { path: REVIEW_WORK, score: 71.3, commits: 6, trend: "heating", trackedBy: [240] },
    ]);
    expect(health.thresholdOverrides).toEqual([
      {
        path: "capabilities/reviews/web/src/controllers/reviewer/use-reviewer.ts",
        function: "useReviewer",
        line: 127,
        lines: 302,
        cognitive: 20,
        reason: "Shared session closures.",
      },
    ]);
  });
});

describe("fallow duplication summary", () => {
  test("keeps clone groups with at least two production instances and flags axis groups", () => {
    const dupes = summarizeFallowDupes({
      rawDupes: {
        clone_groups: [
          {
            line_count: 20,
            instances: [
              { file: "capabilities/rounds/vite.config.ts", start_line: 1, end_line: 20 },
              { file: "capabilities/reviews/vite.config.ts", start_line: 1, end_line: 20 },
            ],
          },
          {
            line_count: 14,
            suggested_name: "applicationCases",
            instances: [
              {
                file: "capabilities/applications/business/src/server/persistence/commands/intake.ts",
                start_line: 10,
                end_line: 24,
              },
              {
                file: "capabilities/reviews/business/src/server/persistence/commands/reviews.ts",
                start_line: 30,
                end_line: 44,
              },
            ],
          },
        ],
      },
      pathPatterns: ["capabilities/*/business/src/server/**"],
      trackedPathsByIssue,
    });
    expect(dupes).toEqual([
      {
        lines: 14,
        suggestedName: "applicationCases",
        instances: [
          "capabilities/applications/business/src/server/persistence/commands/intake.ts:10-24",
          "capabilities/reviews/business/src/server/persistence/commands/reviews.ts:30-44",
        ],
        inAxis: true,
        trackedBy: [],
      },
    ]);
  });
});

describe("fallow entry weight summary", () => {
  test("reports eager weight in kilobytes with tracking issues", () => {
    const weights = summarizeEntryWeights({
      rawEntryWeight: {
        entry_weight: {
          entries: [
            {
              path: "app/src/router.tsx",
              source: "tanstack-router",
              eager_modules: 634,
              eager_bytes: 1_711_104,
              deferred_modules: 2,
            },
          ],
        },
      },
      trackedPathsByIssue,
    });
    expect(weights).toEqual([
      {
        path: "app/src/router.tsx",
        source: "tanstack-router",
        eagerModules: 634,
        eagerKb: 1671,
        deferredModules: 2,
        trackedBy: [240, 243],
      },
    ]);
  });
});
