import { WorkflowNotFoundError } from "@temporalio/client";
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
  const signal = vi.fn();
  const workflow = {
    start: vi.fn(),
    signalWithStart: vi.fn(),
    getHandle: vi.fn(() => ({ signal })),
  };
  const report = vi.fn();

  const starter = (timeoutMs?: number) =>
    createWorkflowStarter({
      client: () => ({ workflow }) as never,
      taskQueue: "merit",
      report,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });

  return { workflow, signal, report, starter };
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

describe("signaling work", () => {
  const request = {
    workflowId: "assistant-conversation:1",
    signal: "cancelTurn",
    operation: "x.cancel",
  };

  it("signals the workflow under the ID without starting one", async () => {
    const { workflow, signal, report, starter } = setup();
    signal.mockResolvedValue(undefined);

    expect(await starter().signal(request)).toBe("signaled");

    expect(workflow.getHandle).toHaveBeenCalledWith("assistant-conversation:1");
    expect(signal).toHaveBeenCalledWith("cancelTurn");
    expect(workflow.start).not.toHaveBeenCalled();
    expect(workflow.signalWithStart).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("answers absent, without a report, when no workflow runs under the ID", async () => {
    const { signal, report, starter } = setup();
    signal.mockRejectedValue(new WorkflowNotFoundError("gone", "assistant-conversation:1", ""));

    expect(await starter().signal(request)).toBe("absent");
    expect(report).not.toHaveBeenCalled();
  });

  it("reports an unreachable Temporal by operation name only and does not throw", async () => {
    const { signal, report, starter } = setup();
    signal.mockRejectedValue(new Error("jo@example.test unreachable"));

    expect(await starter().signal(request)).toBe("failed");
    expect(report).toHaveBeenCalledExactlyOnceWith("x.cancel");
  });

  it("gives up on a signal that never answers", async () => {
    const { signal, report, starter } = setup();
    signal.mockReturnValue(new Promise(() => {}));

    expect(await starter(20).signal(request)).toBe("failed");
    expect(report).toHaveBeenCalledExactlyOnceWith("x.cancel");
  });
});
