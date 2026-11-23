import { describe, expect, test } from "vite-plus/test";

import {
  buildCommitQueryArgs,
  buildScoutContext,
  collectUnreadVerifications,
  formatScoutStateBody,
  listDocAreas,
  listPackageSlices,
  parseCommitLog,
  parseScoutState,
  pickRotationItem,
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
});
