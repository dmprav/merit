import { describe, expect, it, vi } from "vite-plus/test";

import { formatSafeLogEntry, writeSafeLogEntry } from "./runtime-logger.ts";

const entry = (message: string, meta?: Record<string, unknown>) =>
  formatSafeLogEntry({ level: "WARN", timestampNanos: 1_700_000_000_000_000_000n, message, meta });

describe("the runtime log format", () => {
  it("keeps the level, workflow type and a safe identifier", () => {
    const line = entry("Activity failed", {
      sdkComponent: "activity",
      activityType: "sendReviewerMessage",
      workflowType: "reviewerMessage",
      workflowId: "reviewer-message:0a1b",
      attempt: 3,
    });

    expect(line).toBe(
      "2023-11-14T22:13:20.000Z [WARN] Activity failed sdkComponent=activity activityType=sendReviewerMessage workflowType=reviewerMessage workflowId=reviewer-message:0a1b attempt=3\n",
    );
  });

  it("drops failure text, stacks, tokens and other attributes", () => {
    const line = entry("Activity failed", {
      error: new Error("jo@example.test could not be reached"),
      stack: "Error: secret\n    at send (/app/send.ts:1:1)",
      taskToken: "token-value",
      workflowRunId: "run",
      activityType: "send",
    });

    expect(line).toContain("activityType=send");
    for (const leaked of ["jo@example.test", "secret", "/app/send.ts", "token-value", "run"]) {
      expect(line).not.toContain(leaked);
    }
  });

  it("cuts failure text the SDK appends to a message", () => {
    const line = entry("Error while processing ActivityTask.start: jo@example.test bounced\nat x");

    expect(line).toContain("[WARN] Error while processing ActivityTask.start\n");
    expect(line).not.toContain("jo@example.test");
  });
});

describe("writing runtime log entries", () => {
  it("writes the formatted line to stderr, with no fields when there are none", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    writeSafeLogEntry({
      level: "ERROR",
      timestampNanos: 0n,
      message: "Failed to initiate shutdown",
    });

    expect(write).toHaveBeenCalledExactlyOnceWith(
      "1970-01-01T00:00:00.000Z [ERROR] Failed to initiate shutdown\n",
    );
    write.mockRestore();
  });
});
