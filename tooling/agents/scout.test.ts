import { describe, expect, test } from "vite-plus/test";

import { SCOUT_LENSES } from "./proposal.ts";
import {
  AUTO_LENS_PRIORITY,
  buildCommitQueryArgs,
  buildScoutContext,
  collectUnreadVerifications,
  formatScoutStateBody,
  LENS_TARGET_INTERVAL_DAYS,
  listDocAreas,
  listPackageSlices,
  parseAdvanceLensFlag,
  parseCommitLog,
  parseContextLensFlag,
  parseScoutState,
  pickRotationItem,
  resolveRotationTarget,
  selectAutoLens,
} from "./scout.ts";

describe("scout", () => {
  test("parses and updates durable scout cursor state without letting one corrupt entry wipe siblings", () => {
    const initial = "State store.\n\n<!-- merit-scout-state: {} -->";
    expect(parseScoutState(initial)).toEqual({});

    const updated = formatScoutStateBody(initial, {
      tests: {
        lastCommitSha: "c7e4efa123",
        lastCommitDate: "2026-11-22T22:26:16Z",
        lastRunAt: "2026-11-22T23:00:00Z",
      },
    });
    expect(parseScoutState(updated)).toEqual({
      tests: {
        lastCommitSha: "c7e4efa123",
        lastCommitDate: "2026-11-22T22:26:16Z",
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

  test("computes deterministic doc areas, package slices, rotation target, and unread verifications", () => {
    const tracked = [
      "README.md",
      "docs/README.md",
      "docs/guides/testing.md",
      ".github/pull_request_template.md",
      ".agents/tasks/scout.md",
      "verifications/208.md",
      "verifications/216.md",
      "verifications/217.md",
      "capabilities/reviews/business/src/index.ts",
      "foundation/ui/README.md",
      "tooling/testing/browser/config.ts",
    ];

    expect(listDocAreas(tracked)).toEqual([".", "docs/guides", "foundation/ui"]);
    expect(listPackageSlices(tracked)).toEqual([
      "capabilities/reviews",
      "foundation/ui",
      "tooling/testing",
    ]);
    expect(collectUnreadVerifications(tracked, 208)).toEqual([
      { prNumber: 216, path: "verifications/216.md" },
      { prNumber: 217, path: "verifications/217.md" },
    ]);

    const day0 = new Date(Date.UTC(2026, 10, 13, 12, 0, 0));
    const day1 = new Date(Date.UTC(2026, 10, 14, 12, 0, 0));
    const preEpoch = new Date(Date.UTC(2026, 10, 12, 12, 0, 0));
    expect(pickRotationItem([], day0)).toBeNull();
    expect(pickRotationItem(["b", "a", "c"], day0)).toBe("a");
    expect(pickRotationItem(["b", "a", "c"], day1)).toBe("b");
    expect(pickRotationItem(["b", "a", "c"], preEpoch)).toBe("c");
    expect(pickRotationItem(["b", "a", "c"], day0, 2)).toBe("c");
  });

  test("resolves domain-scoped offset rotation targets for every lens", () => {
    const tracked = [
      "docs/guides/testing.md",
      "capabilities/reviews/business/src/server/service.ts",
      "capabilities/rounds/ai/src/tools.ts",
      "foundation/auth/src/index.ts",
      "foundation/dates/src/index.ts",
      "foundation/db/src/schema.ts",
      "interfaces/mcp/src/server.ts",
    ];
    const day0 = new Date(Date.UTC(2026, 10, 13, 12, 0, 0));

    expect(resolveRotationTarget("verification-flakes", tracked, day0)).toBeNull();
    expect(resolveRotationTarget("docs", tracked, day0)).toBe("docs/guides");

    // security excludes pure utility foundation slices like foundation/dates.
    const securityTargets = new Set(
      Array.from({ length: 10 }, (_, d) =>
        resolveRotationTarget("security", tracked, new Date(Date.UTC(2026, 10, 13 + d, 12, 0, 0))),
      ),
    );
    expect(securityTargets.has("foundation/dates")).toBe(false);
    expect(securityTargets.has("foundation/auth")).toBe(true);
    expect(securityTargets.has("capabilities/reviews")).toBe(true);

    // mcp-db rotates only across MCP, DB, and server-bearing capability slices.
    const mcpDbTargets = new Set(
      Array.from({ length: 10 }, (_, d) =>
        resolveRotationTarget("mcp-db", tracked, new Date(Date.UTC(2026, 10, 13 + d, 12, 0, 0))),
      ),
    );
    expect(mcpDbTargets).toEqual(
      new Set(["capabilities/reviews", "capabilities/rounds", "foundation/db", "interfaces/mcp"]),
    );

    // architecture, simplification, and tests use distinct offsets on the same day.
    const archTarget = resolveRotationTarget("architecture", tracked, day0);
    const simpTarget = resolveRotationTarget("simplification", tracked, day0);
    const testsTarget = resolveRotationTarget("tests", tracked, day0);
    expect(new Set([archTarget, simpTarget, testsTarget]).size).toBe(3);
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
