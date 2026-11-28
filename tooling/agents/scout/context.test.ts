import { describe, expect, test } from "vite-plus/test";

import { buildScoutContext, type ScoutRun, type ScoutScan } from "./context.ts";
import { parseCommitLog } from "./git.ts";
import { resolveRunTarget } from "./runs.ts";

const run = (id: string, cursor?: ScoutRun["cursor"]): ScoutRun => ({
  id,
  target: resolveRunTarget(id),
  cursor,
  scanTipSha: "abc1234567",
});

const scan: ScoutScan = {
  commits: parseCommitLog("abc1234\t2026-11-22T00:00:00Z\tfeat: example"),
  changedFiles: ["capabilities/reviews/business/src/server/service.ts"],
  telemetry: null,
  unreadVerifications: null,
  openIssues: [],
  wontfixIssues: [],
};

describe("ready scout context", () => {
  test("names the run and its concerns, reports the scan, and classifies changed paths by mechanism", () => {
    const context = buildScoutContext(run("change-batch"), scan);
    expect(context).toMatchObject({
      status: "ready",
      run: { id: "change-batch", kind: "change-batch", target: "merged commits on origin/main" },
      scanTipSha: "abc1234567",
      cursor: null,
      concerns: ["bugs-security", "tests", "docs", "architecture", "simplification", "mcp-db"],
    });
    expect(context.matchedMechanisms.risk).toBe("composes");
    expect(context).not.toHaveProperty("telemetry");
    expect(context).not.toHaveProperty("unreadVerifications");
    expect(context).not.toHaveProperty("rotationTarget");
    expect(context).not.toHaveProperty("openProposedCount");
  });

  test("echoes the cursor the run resumes from", () => {
    const cursor = { lastCommitSha: "abcdef12", lastRunAt: "2026-11-22T00:00:00Z" };
    expect(buildScoutContext(run("area:tooling/agents", cursor), scan).cursor).toEqual(cursor);
  });

  test("lists telemetry and unread verifications when the scan has them", () => {
    const unread = [{ prNumber: 250, path: "verifications/250.md" }];
    const context = buildScoutContext(run("records"), { ...scan, unreadVerifications: unread });
    expect(context.unreadVerifications).toEqual(unread);
    expect(context.concerns).toEqual(["verification"]);
  });

  test("gives each kind its own concern order", () => {
    expect(buildScoutContext(run("mechanism:audit-trail"), scan).concerns[0]).toBe("architecture");
    expect(buildScoutContext(run("area:docs"), scan).concerns[0]).toBe("bugs-security");
  });
});
