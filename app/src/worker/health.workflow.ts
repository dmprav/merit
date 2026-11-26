import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities.ts";

const { confirmWorkerHealth } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 1 },
});

/**
 * Proves that the worker is running: the workflow executes in the sandbox, calls an activity
 * in the worker process, and returns. It carries only an identifier, like every Merit workflow.
 */
export const workerHealth = async (input: { probeId: string }) => ({
  probeId: input.probeId,
  status: await confirmWorkerHealth(input.probeId),
});
