import { existsSync } from "node:fs";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

import { readTemporalConfig, runWorker, type WorkerLogger } from "@merit/workflows";

import * as activities from "./activities.ts";
import { taskQueue } from "./task-queue.ts";

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
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info("Stopping after work in flight finishes.");
    stop.abort();
  });
}

try {
  // The development and preview commands set MERIT_LOCAL_WORKER; a deployed worker must not.
  const config = readTemporalConfig(env, { local: env.MERIT_LOCAL_WORKER === "1" });
  await runWorker(
    {
      config,
      taskQueue,
      workflows: {
        workflowsPath: fileURLToPath(new URL("./workflows.workflow.ts", import.meta.url)),
      },
      activities,
    },
    { logger, signal: stop.signal },
  );
} catch (error) {
  logger.error(`The worker stopped: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
