import { describe, expect, test } from "vite-plus/test";

import { buildScoutContext } from "./context.ts";
import { parseCommitLog } from "./git.ts";

const contextAt = (openProposedCount: number) =>
  buildScoutContext({
    lens: "architecture",
    cursor: undefined,
    scanTipSha: "abc1234567",
    openProposedCount,
    commits: parseCommitLog("abc1234\t2026-11-22T00:00:00Z\tfeat: example"),
    changedFiles: ["capabilities/reviews/business/src/server/service.ts"],
    rotationTarget: null,
    unreadVerifications: [],
    openIssues: [],
    wontfixIssues: [],
  });

describe("scout context", () => {
  test("is ready below the open proposal cap and classifies changed paths", () => {
    const ready = contextAt(4);
    expect(ready.status).toBe("ready");
    expect(ready.scanTipSha).toBe("abc1234567");
    expect(ready.status === "ready" ? ready.matchedMechanisms.risk : null).toBe("composes");
  });

  test("halts at the open proposal cap", () => {
    expect(contextAt(5).status).toBe("cap_reached");
  });
});
