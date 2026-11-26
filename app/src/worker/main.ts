import { existsSync } from "node:fs";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

import { reportError } from "@merit/telemetry/errors";
import {
  createWorkflowClient,
  describeError,
  ensureSchedule,
  readTemporalConfig,
  runWorker,
  type WorkerLogger,
} from "@merit/workflows";

import * as activities from "./activities.ts";
import { reconcileScheduleId } from "./reconcile.workflow.ts";
import { taskQueue } from "./task-queue.ts";

const reconcileEvery = 60_000;

const logger: WorkerLogger = {
  info: (message) => console.log(`[worker] ${message}`),
  warn: (message) => console.warn(`[worker] ${message}`),
  error: (message) => console.error(`[worker] ${message}`),
};

// The web server loads app/.env.local through Vite; the worker has no Vite, so it reads the same file.
const localEnvironment = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(localEnvironment)) {
  process.loadEnvFile(localEnvironment);
}

const stop = new AbortController();
const received = new Set<string>();
const exitCodes = { SIGINT: 130, SIGTERM: 143 } as const;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // The same signal again, such as a second Ctrl+C, stops waiting for work in flight.
    if (received.has(signal)) {
      logger.warn("Stopping now.");
      process.exit(exitCodes[signal]);
    }
    // A different signal while stopping, such as the dev runner's SIGTERM after Ctrl+C, adds nothing.
    if (received.size === 0) {
      logger.info("Stopping after work in flight finishes.");
      stop.abort();
    }
    received.add(signal);
  });
}

let exitCode = 0;
try {
  // The development and preview commands set MERIT_LOCAL_WORKER; a deployed worker must not.
  const config = readTemporalConfig(env, { local: env.MERIT_LOCAL_WORKER === "1" });
  const client = createWorkflowClient(config);
  await runWorker(
    {
      config,
      taskQueue,
      workflows: {
        workflowsPath: fileURLToPath(new URL("./workflows.workflow.ts", import.meta.url)),
      },
      activities,
    },
    {
      logger,
      signal: stop.signal,
      // Idempotent: every worker start leaves exactly one reconciliation Schedule.
      onConnected: () =>
        ensureSchedule(client, {
          scheduleId: reconcileScheduleId,
          workflowType: "reconcile",
          taskQueue,
          everyMs: reconcileEvery,
          workflowId: reconcileScheduleId,
        }),
    },
  );
} catch (error) {
  logger.error(`The worker stopped: ${describeError(error)}`);
  reportError(error, { surface: "server", operation: "worker.run" });
  exitCode = 1;
}
// The SDK's native runtime keeps the process alive after the worker is done, so end it here.
process.exit(exitCode);
