import { describe, expect, test } from "vite-plus/test";

import { SCOUT_LENSES } from "./proposal.ts";
import {
  ARCHITECTURE_AXES,
  AUTO_LENS_PRIORITY,
  buildCapabilitySymmetry,
  buildCommitQueryArgs,
  buildScoutContext,
  buildTrackedPathsIndex,
  collectUnreadVerifications,
  extractLatestTrustedRejectionReason,
  formatScoutStateBody,
  LENS_TARGET_INTERVAL_DAYS,
  listDocAreas,
  listPackageSlices,
  parseAdvanceLensFlag,
  parseCommitLog,
  parseContextLensFlag,
  parseScoutState,
  pickNextRotationItem,
  resolveRotationTarget,
  selectAutoLens,
  SIMPLIFICATION_LAYERS,
  summarizeEntryWeights,
  summarizeFallowDupes,
  summarizeFallowHealth,
} from "./scout.ts";

describe("scout", () => {
  test("parses and updates durable scout cursor state without letting one corrupt entry wipe siblings", () => {
    const initial = "State store.\n\n<!-- merit-scout-state: {} -->";
    expect(parseScoutState(initial)).toEqual({});

    const updated = formatScoutStateBody(initial, {
      tests: {
        lastCommitSha: "c7e4efa123",
        lastCommitDate: "2026-11-22T22:26:16Z",
        lastRotationTarget: "capabilities/reviews",
        lastRunAt: "2026-11-22T23:00:00Z",
      },
    });
    expect(parseScoutState(updated)).toEqual({
      tests: {
        lastCommitSha: "c7e4efa123",
        lastCommitDate: "2026-11-22T22:26:16Z",
        lastRotationTarget: "capabilities/reviews",
        lastRunAt: "2026-11-22T23:00:00Z",
      },
    });

    const partiallyCorrupt =
      '<!-- merit-scout-state: {"docs":{"lastCommitSha":"abcdef12","lastRunAt":"2026-11-22T00:00:00Z"},"tests":{"lastPrNumber":-5,"lastRunAt":"2026-11-22T00:00:00Z"}} -->';
    expect(parseScoutState(partiallyCorrupt)).toEqual({
      docs: { lastCommitSha: "abcdef12", lastRunAt: "2026-11-22T00:00:00Z" },
    });
  });

  test("falls back to commit date on squashed SHA and to fallbackSinceIso when cursor is absent", () => {
    const ancestorArgs = buildCommitQueryArgs({
      cursor: {
        lastCommitSha: "abcdef1234",
        lastCommitDate: "2026-11-20T00:00:00Z",
        lastRunAt: "2026-11-20T01:00:00Z",
      },
      isAncestor: () => true,
      fallbackSinceIso: "2026-11-15T00:00:00Z",
    });
    expect(ancestorArgs).toContain("abcdef1234..origin/main");

    const squashedArgs = buildCommitQueryArgs({
      cursor: {
        lastCommitSha: "deadbeef00",
        lastCommitDate: "2026-11-20T00:00:00Z",
        lastRunAt: "2026-11-20T01:00:00Z",
      },
      isAncestor: () => false,
      fallbackSinceIso: "2026-11-15T00:00:00Z",
    });
    expect(squashedArgs).toContain("--since=2026-11-20T00:00:00Z");
    expect(squashedArgs).not.toContain("deadbeef00..origin/main");

    const freshArgs = buildCommitQueryArgs({
      cursor: undefined,
      isAncestor: () => false,
      fallbackSinceIso: "2026-11-15T00:00:00Z",
    });
    expect(freshArgs).toContain("--since=2026-11-15T00:00:00Z");
  });

  test("computes doc areas, package slices including app, unread verifications, and round-robin rotation", () => {
    const tracked = [
      "README.md",
      "docs/README.md",
      "docs/guides/testing.md",
      ".github/pull_request_template.md",
      ".agents/tasks/scout.md",
      "verifications/208.md",
      "verifications/216.md",
      "verifications/217.md",
      "app/src/server/identity.ts",
      "capabilities/reviews/business/src/index.ts",
      "foundation/ui/README.md",
      "tooling/testing/browser/config.ts",
    ];

    expect(listDocAreas(tracked)).toEqual([".", "docs/guides", "foundation/ui"]);
    expect(listPackageSlices(tracked)).toEqual([
      "app",
      "capabilities/reviews",
      "foundation/ui",
      "tooling/testing",
    ]);
    expect(collectUnreadVerifications(tracked, 208)).toEqual([
      { prNumber: 216, path: "verifications/216.md" },
      { prNumber: 217, path: "verifications/217.md" },
    ]);

    expect(pickNextRotationItem([], undefined)).toBeNull();
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], undefined)).toBe("axis-a");
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], "axis-a")).toBe("axis-b");
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], "axis-c")).toBe("axis-a");
    expect(pickNextRotationItem(["axis-a", "axis-b", "axis-c"], "removed-axis")).toBe("axis-a");
  });

  test("visits every horizontal architecture axis, simplification layer, and domain-scoped slice without aliasing", () => {
    const tracked = [
      "docs/guides/testing.md",
      "app/src/server/middleware.ts",
      "capabilities/reviews/business/src/server/service.ts",
      "capabilities/rounds/ai/src/tools.ts",
      "foundation/auth/src/index.ts",
      "foundation/dates/src/index.ts",
      "foundation/db/src/schema.ts",
      "interfaces/mcp/src/server.ts",
    ];

    expect(resolveRotationTarget("verification-flakes", tracked, undefined)).toEqual({
      target: null,
      axis: null,
    });
    expect(resolveRotationTarget("docs", tracked, undefined).target).toBe("docs/guides");

    let lastArch: string | undefined;
    const seenArch: string[] = [];
    for (let i = 0; i < ARCHITECTURE_AXES.length; i += 1) {
      const next = resolveRotationTarget("architecture", tracked, lastArch);
      expect(next.axis?.id).toBe(next.target);
      if (next.target) {
        seenArch.push(next.target);
        lastArch = next.target;
      }
    }
    expect(seenArch).toEqual(ARCHITECTURE_AXES.map((axis) => axis.id));
    expect(resolveRotationTarget("architecture", tracked, lastArch).target).toBe(
      ARCHITECTURE_AXES[0]?.id,
    );

    let lastSimp: string | undefined;
    const seenSimp: string[] = [];
    for (let i = 0; i < SIMPLIFICATION_LAYERS.length; i += 1) {
      const next = resolveRotationTarget("simplification", tracked, lastSimp);
      expect(next.axis?.id).toBe(next.target);
      if (next.target) {
        seenSimp.push(next.target);
        lastSimp = next.target;
      }
    }
    expect(seenSimp).toEqual(SIMPLIFICATION_LAYERS.map((layer) => layer.id));

    let lastSec: string | undefined;
    const securityTargets = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const next = resolveRotationTarget("security", tracked, lastSec);
      if (next.target) {
        securityTargets.add(next.target);
        lastSec = next.target;
      }
    }
    expect(securityTargets.has("app")).toBe(true);
    expect(securityTargets.has("foundation/auth")).toBe(true);
    expect(securityTargets.has("foundation/dates")).toBe(false);

    let lastMcp: string | undefined;
    const mcpDbTargets = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const next = resolveRotationTarget("mcp-db", tracked, lastMcp);
      if (next.target) {
        mcpDbTargets.add(next.target);
        lastMcp = next.target;
      }
    }
    expect(mcpDbTargets).toEqual(
      new Set(["capabilities/reviews", "capabilities/rounds", "foundation/db", "interfaces/mcp"]),
    );
  });

  test("summarizes fallow telemetry, excludes test/fixture files, tags trackedBy issues, and extracts trusted wontfix reasons", () => {
    const trackedPaths = buildTrackedPathsIndex([
      {
        number: 240,
        body: '<!-- merit-proposal: {"kind":"design","lens":"architecture","paths":["capabilities/reviews/web/src/views/reviews/editable-review-work.tsx","app/src/router.tsx"]} -->',
      },
      {
        number: 242,
        body: '<!-- merit-proposal: {"kind":"design","lens":"architecture","paths":["capabilities/*/web/src/views/**"]} -->',
      },
      {
        number: 243,
        body: '<!-- merit-proposal: {"kind":"design","lens":"architecture","paths":["app/src"]} -->',
      },
    ]);

    const health = summarizeFallowHealth({
      rawHealth: {
        file_scores: [
          {
            path: "interfaces/product/src/features/grantmaking/testing/intake.story-fixtures.tsx",
            fan_in: 0,
            fan_out: 40,
            lines: 900,
            function_count: 20,
            total_cyclomatic: 99,
            total_cognitive: 50,
          },
          {
            path: "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx",
            fan_in: 1,
            fan_out: 31,
            lines: 725,
            function_count: 51,
            total_cyclomatic: 132,
            total_cognitive: 80,
          },
        ],
        hotspots: [
          {
            path: "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx",
            score: 71.26,
            commits: 6,
            trend: "heating",
          },
        ],
        threshold_overrides: [
          {
            status: "active",
            path: "capabilities/reviews/web/src/controllers/reviewer/use-reviewer.ts",
            function: "useReviewer",
            line: 127,
            metrics: { cognitive: 20, line_count: 302 },
            reason: "Shared session closures.",
          },
        ],
      },
      pathPatterns: ["capabilities/*/web/src/**"],
      trackedPathsByIssue: trackedPaths,
    });

    expect(health.topFiles).toHaveLength(1);
    expect(health.topFiles[0]).toMatchObject({
      path: "capabilities/reviews/web/src/views/reviews/editable-review-work.tsx",
      inAxis: true,
      trackedBy: [240, 242],
    });
    expect(health.hotspots[0]?.trackedBy).toEqual([240, 242]);
    expect(health.thresholdOverrides[0]?.function).toBe("useReviewer");

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
      trackedPathsByIssue: trackedPaths,
    });
    expect(dupes).toHaveLength(1);
    expect(dupes[0]?.inAxis).toBe(true);

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
      trackedPathsByIssue: trackedPaths,
    });
    expect(weights[0]).toMatchObject({
      path: "app/src/router.tsx",
      eagerModules: 634,
      eagerKb: 1671,
      trackedBy: [240, 243],
    });

    expect(
      buildCapabilitySymmetry([
        "capabilities/rounds/business/src/domain/round.ts",
        "capabilities/rounds/business/src/domain/round.test.ts",
        "capabilities/rounds/business/src/server/service.ts",
        "capabilities/rounds/ai/src/tools.ts",
      ]),
    ).toEqual([{ capability: "rounds", domain: 1, server: 1, web: 0, ai: 1 }]);

    expect(
      extractLatestTrustedRejectionReason([
        { authorAssociation: "OWNER", body: "Keep cents only, block >2 decimals on input." },
        { authorAssociation: "NONE", body: "Untrusted follow-up ignored." },
      ]),
    ).toBe("Keep cents only, block >2 decimals on input.");
  });

  test("halts at the open agent:proposed cap boundary (4 ready vs 5 cap_reached)", () => {
    const readyAtFour = buildScoutContext({
      lens: "architecture",
      cursor: undefined,
      scanTipSha: "abc1234567",
      openProposedCount: 4,
      commits: parseCommitLog("abc1234\t2026-11-22T00:00:00Z\tfeat: example"),
      changedFiles: ["capabilities/reviews/business/src/server/service.ts"],
      rotationTarget: null,
      unreadVerifications: [],
      openIssues: [],
      wontfixIssues: [],
    });
    expect(readyAtFour.status).toBe("ready");
    expect(readyAtFour.scanTipSha).toBe("abc1234567");
    if (readyAtFour.status === "ready") {
      expect(readyAtFour.matchedMechanisms.risk).toBe("composes");
    }

    const cappedAtFive = buildScoutContext({
      lens: "architecture",
      cursor: undefined,
      scanTipSha: "abc1234567",
      openProposedCount: 5,
      commits: parseCommitLog("abc1234\t2026-11-22T00:00:00Z\tfeat: example"),
      changedFiles: ["capabilities/reviews/business/src/server/service.ts"],
      rotationTarget: null,
      unreadVerifications: [],
      openIssues: [],
      wontfixIssues: [],
    });
    expect(cappedAtFive.status).toBe("cap_reached");
  });

  test("bootstraps never-run lenses in high-impact AUTO_LENS_PRIORITY order covering every lens", () => {
    expect([...AUTO_LENS_PRIORITY].sort()).toEqual([...SCOUT_LENSES].sort());

    const dayMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.UTC(2026, 10, 23, 8, 0, 0);

    const ago = (days: number) => ({ lastRunAt: new Date(nowMs - days * dayMs).toISOString() });

    expect(selectAutoLens({ state: {}, nowMs })).toEqual({
      due: true,
      lens: "architecture",
      targetIntervalDays: LENS_TARGET_INTERVAL_DAYS.architecture,
      lastRunAt: null,
    });
    expect(selectAutoLens({ state: { architecture: ago(0.5) }, nowMs })).toEqual({
      due: true,
      lens: "simplification",
      targetIntervalDays: LENS_TARGET_INTERVAL_DAYS.simplification,
      lastRunAt: null,
    });
  });

  test("picks the lens with the highest overdue ratio once every lens has run", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.UTC(2026, 10, 23, 8, 0, 0);

    const ago = (days: number) => ({ lastRunAt: new Date(nowMs - days * dayMs).toISOString() });

    // security: 4.5d / 3d = 1.50; architecture: 2.8d / 2d = 1.40; docs: 5d / 4d = 1.25.
    expect(
      selectAutoLens({
        state: {
          architecture: ago(2.8),
          simplification: ago(1),
          security: ago(4.5),
          "mcp-db": ago(2),
          tests: ago(2),
          docs: ago(5),
          "verification-flakes": ago(2),
        },
        nowMs,
      }),
    ).toMatchObject({
      due: true,
      lens: "security",
      targetIntervalDays: 3,
    });
  });

  test("returns idle with the soonest upcoming lens when all lenses are fresh, including future timestamps", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.UTC(2026, 10, 23, 8, 0, 0);

    const ago = (days: number) => ({ lastRunAt: new Date(nowMs - days * dayMs).toISOString() });

    // architecture (2d target) has 0.5d (12h) remaining vs security (3d target) having 1d (24h) remaining.
    expect(
      selectAutoLens({
        state: {
          architecture: ago(1.5),
          simplification: ago(1),
          security: ago(2),
          "mcp-db": ago(1),
          tests: ago(1),
          docs: ago(1),
          "verification-flakes": ago(1),
        },
        nowMs,
      }),
    ).toEqual({
      due: false,
      nextLens: "architecture",
      nextDueInHours: 12,
    });

    // A future timestamp on architecture (due in 72h) ranks behind simplification (due in 48h).
    expect(
      selectAutoLens({
        state: {
          architecture: ago(-1),
          simplification: ago(0),
          security: ago(0),
          "mcp-db": ago(0),
          tests: ago(0),
          docs: ago(0),
          "verification-flakes": ago(0),
        },
        nowMs,
      }),
    ).toEqual({
      due: false,
      nextLens: "simplification",
      nextDueInHours: 48,
    });
  });

  test("allows --lens auto for context and rejects --lens auto for advance", () => {
    expect(parseContextLensFlag(["--lens", "auto"])).toBe("auto");
    expect(parseContextLensFlag(["--lens", "security"])).toBe("security");
    expect(parseAdvanceLensFlag(["--lens", "security"])).toBe("security");
    expect(() => parseAdvanceLensFlag(["--lens", "auto"])).toThrow(/Cannot pass "--lens auto"/);
  });
});
