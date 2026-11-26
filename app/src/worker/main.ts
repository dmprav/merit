import { existsSync } from "node:fs";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

import { reportError } from "@merit/telemetry/errors";
import { describeError, ensureSchedule, runWorker, type WorkerLogger } from "@merit/workflows";

import { createWorkerRuntime } from "./runtime.ts";

const reconcileEvery = 60_000;

const logger: WorkerLogger = {
  info: (message) => console.log(`[worker] ${message}`),
  warn: (message) => console.warn(`[worker] ${message}`),
  error: (message) => console.error(`[worker] ${message}`),
};

// The web server loads app/.env.local and the root .env.local through Vite; the worker has no
// Vite, so it reads the same files, with the app file taking precedence.
for (const file of ["../../.env.local", "../../../.env.local"]) {
  const localEnvironment = fileURLToPath(new URL(file, import.meta.url));
  if (existsSync(localEnvironment)) {
    process.loadEnvFile(localEnvironment);
  }
}
// Locally, email links follow the development port when no origin is configured.
if (env.MERIT_LOCAL_WORKER === "1" && !env.APP_ORIGIN && env.MERIT_DEV_PORT) {
  env.APP_ORIGIN = `http://localhost:${env.MERIT_DEV_PORT}`;
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
  const { config, client, activities, activityQueues, queues } = createWorkerRuntime(env);
  await runWorker(
    {
      config,
      taskQueue: queues.taskQueue,
      workflows: {
        workflowsPath: fileURLToPath(new URL("./workflows.workflow.ts", import.meta.url)),
      },
      activities,
      activityQueues,
    },
    {
      logger,
      signal: stop.signal,
      // Idempotent: every worker start leaves exactly one reconciliation Schedule.
      onConnected: () =>
        ensureSchedule(client, {
          scheduleId: queues.reconcileScheduleId,
          workflowType: "reconcile",
          taskQueue: queues.taskQueue,
          everyMs: reconcileEvery,
          workflowId: queues.reconcileScheduleId,
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
