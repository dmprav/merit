import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import { describe, expect, it, vi } from "vite-plus/test";

import { createWorkflowStarter } from "./start.ts";

const request = {
  workflowType: "reviewerMessage",
  workflowId: "reviewer-message:1",
  args: [{ messageId: "1" }],
  operation: "reviewer-message.start",
};

const setup = () => {
  const workflow = { start: vi.fn(), signalWithStart: vi.fn() };
  const report = vi.fn();

  const starter = (timeoutMs?: number) =>
    createWorkflowStarter({
      client: () => ({ workflow }) as never,
      taskQueue: "merit",
      report,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });

  return { workflow, report, starter };
};

describe("starting work", () => {
  it("starts with the derived ID and leaves completed work alone", async () => {
    const { workflow, report, starter } = setup();
    workflow.start.mockResolvedValue({});

    expect(await starter().start(request)).toBe("started");

    expect(workflow.start).toHaveBeenCalledWith("reviewerMessage", {
      taskQueue: "merit",
      workflowId: "reviewer-message:1",
      args: [{ messageId: "1" }],
      workflowIdReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("treats work that already exists as a no-op", async () => {
    const { workflow, report, starter } = setup();
    workflow.start.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError("exists", "reviewer-message:1", "reviewerMessage"),
    );

    expect(await starter().start(request)).toBe("exists");
    expect(report).not.toHaveBeenCalled();
  });

  it("signals with start on the requested queue and lets a closed ID run again", async () => {
    const { workflow, starter } = setup();
    workflow.signalWithStart.mockResolvedValue({});

    await starter().start({
      ...request,
      taskQueue: "turns",
      closed: "restart",
      signal: { name: "wake" },
    });

    expect(workflow.signalWithStart).toHaveBeenCalledWith("reviewerMessage", {
      taskQueue: "turns",
      workflowId: "reviewer-message:1",
      args: [{ messageId: "1" }],
      workflowIdReusePolicy: "ALLOW_DUPLICATE",
      signal: "wake",
      signalArgs: [],
    });
    expect(workflow.start).not.toHaveBeenCalled();
  });

  it("reports a failed start by operation name only and does not throw", async () => {
    const { workflow, report, starter } = setup();
    workflow.start.mockRejectedValue(new Error("jo@example.test unreachable"));

    expect(await starter().start(request)).toBe("failed");
    expect(report).toHaveBeenCalledExactlyOnceWith("reviewer-message.start");
  });

  it("reports a client that cannot be built", async () => {
    const report = vi.fn();
    const starter = createWorkflowStarter({
      client: () => {
        throw new Error("TEMPORAL_ADDRESS is required");
      },
      taskQueue: "merit",
      report,
    });

    expect(await starter.start(request)).toBe("failed");
    expect(report).toHaveBeenCalledExactlyOnceWith("reviewer-message.start");
  });

  it("gives up on a start that never answers", async () => {
    const { workflow, report, starter } = setup();
    workflow.start.mockReturnValue(new Promise(() => {}));

    expect(await starter(20).start(request)).toBe("failed");
    expect(report).toHaveBeenCalledExactlyOnceWith("reviewer-message.start");
  });
});
