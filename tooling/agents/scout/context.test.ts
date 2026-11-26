import { describe, expect, test } from "vite-plus/test";

import { ARCHITECTURE_AXES } from "./axes.ts";
import { buildScoutContext, capReachedContext, type ScoutScan } from "./context.ts";
import { parseCommitLog } from "./git.ts";

const run = {
  lens: "architecture" as const,
  cursor: undefined,
  scanTipSha: "abc1234567",
  openProposedCount: 4,
};

const scan: ScoutScan = {
  commits: parseCommitLog("abc1234\t2026-11-22T00:00:00Z\tfeat: example"),
  changedFiles: ["capabilities/reviews/business/src/server/service.ts"],
  rotation: { target: null, axis: null },
  telemetry: null,
  unreadVerifications: [],
  openIssues: [],
  wontfixIssues: [],
};

describe("ready scout context", () => {
  test("reports the scan and classifies changed paths by mechanism", () => {
    const context = buildScoutContext(run, scan);
    expect(context).toMatchObject({
      status: "ready",
      scanTipSha: "abc1234567",
      cursor: null,
      maxOpenProposals: 5,
    });
    expect(context.matchedMechanisms.risk).toBe("composes");
    expect(context).not.toHaveProperty("rotationAxis");
    expect(context).not.toHaveProperty("telemetry");
  });

  test("describes the rotation axis without its telemetry flags", () => {
    const axis = ARCHITECTURE_AXES.find((entry) => entry.telemetry?.entryWeights);
    expect(axis).toBeDefined();
    const context = buildScoutContext(run, {
      ...scan,
      rotation: { target: axis?.id ?? null, axis: axis ?? null },
    });
    expect(context.rotationTarget).toBe(axis?.id);
    expect(context.rotationAxis).toEqual({
      id: axis?.id,
      summary: axis?.summary,
      anchorDocs: axis?.anchorDocs,
      pathPatterns: axis?.pathPatterns,
      focus: axis?.focus,
    });
  });
});

describe("capped scout context", () => {
  test("reports only the lens, scan tip, and proposal counts", () => {
    expect(capReachedContext({ ...run, openProposedCount: 5 })).toEqual({
      status: "cap_reached",
      lens: "architecture",
      scanTipSha: "abc1234567",
      openProposedCount: 5,
      maxOpenProposals: 5,
    });
  });
});
