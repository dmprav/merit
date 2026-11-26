import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/common";

import type { WorkflowClient } from "./connection.ts";

export type StartRequest = {
  /** Registered workflow type name. */
  workflowType: string;
  /** Derived from the committed record, so starting twice cannot duplicate the work. */
  workflowId: string;
  /** Identifiers and timings only; see the README for the single token exception. */
  args: unknown[];
  /** A safe name for telemetry when the start fails, such as `reviewer-message.start`. */
  operation: string;
  /** Defaults to the starter's task queue. */
  taskQueue?: string;
  /**
   * What an earlier closed run of the same ID means. `keep` (default) leaves work that completed
   * alone, so a reconciler never repeats it, and runs again only after a failed run; `restart`
   * lets the ID run again whenever its last run is closed.
   */
  closed?: "keep" | "restart";
  /** Signal the running workflow, or start it with the signal as its first event. */
  signal?: { name: string; args?: unknown[] };
};

export type StartOutcome =
  /** This call started the workflow, or signaled the one that was running. */
  | "started"
  /** The workflow already ran or is running, so nothing changed. */
  | "exists"
  /** Temporal could not be reached; the failure was reported and the work waits for reconciliation. */
  | "failed";

export type WorkflowStarterOptions = {
  client: () => WorkflowClient;
  taskQueue: string;
  /**
   * Report a failed start by its safe operation name. It must not receive failure text:
   * the cause can carry payload details.
   */
  report: (operation: string) => void;
  /** How long a start may wait for Temporal. Defaults to 5 seconds. */
  timeoutMs?: number;
};

const timedOut = Symbol("timed out");

const within = async <T>(work: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(() => resolve(timedOut), ms);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
    // A start that outlives its limit settles later; its outcome is no longer needed.
    work.catch(() => undefined);
  }
};

/**
 * Start workflows after the business change commits. Starting is idempotent: work that already
 * exists is a no-op. It never throws, and a failure never undoes the commit; it is reported
 * and left to reconciliation. `client` is read on each start so that a missing setting
 * fails there, reported, rather than when the process starts.
 */
export const createWorkflowStarter = ({
  client,
  taskQueue,
  report,
  timeoutMs = 5000,
}: WorkflowStarterOptions) => ({
  async start(request: StartRequest): Promise<StartOutcome> {
    try {
      const workflows = client().workflow;
      const base = {
        taskQueue: request.taskQueue ?? taskQueue,
        workflowId: request.workflowId,
        args: request.args,
        workflowIdReusePolicy:
          request.closed === "restart"
            ? WorkflowIdReusePolicy.ALLOW_DUPLICATE
            : WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      };
      const action: Promise<unknown> = request.signal
        ? workflows.signalWithStart(request.workflowType, {
            ...base,
            signal: request.signal.name,
            signalArgs: request.signal.args ?? [],
          })
        : workflows.start(request.workflowType, base);
      const result = await within(action, timeoutMs);
      if (result === timedOut) {
        report(request.operation);
        return "failed";
      }
      // signalWithStart resolves for a running workflow too; only a rejected start proves it was there.
      return "started";
    } catch (error) {
      if (error instanceof WorkflowExecutionAlreadyStartedError) {
        return "exists";
      }
      report(request.operation);
      return "failed";
    }
  },
});

export type WorkflowStarter = ReturnType<typeof createWorkflowStarter>;
