import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";

import { migrate } from "@merit/db/migrate";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { loadEnvLocalFiles } from "@merit/test-support/env";
import { createTestDatabase } from "@merit/test-support/test-database";
import { createWorkflowClient, readTemporalConfig } from "@merit/workflows/client";

import { workspaceOrigin } from "./browser/ports.ts";

loadEnvLocalFiles([
  resolve(import.meta.dirname, "../.env.local"),
  resolve(import.meta.dirname, "../../.env.local"),
]);

/** How long cleanup waits for Temporal to delete the Schedule. */
const scheduleDeleteDeadlineMs = 5000;

const database = await createTestDatabase();
const output = join(
  tmpdir(),
  `merit-workspace-browser-${new URL(database.connectionString).pathname.slice(1)}`,
);
// The Compose Temporal server is shared with a developer's own worker, so this run's web server
// and worker use queues and a reconciliation Schedule of their own.
const run = crypto.randomUUID().slice(0, 8);
const work = {
  MERIT_TASK_QUEUE: `merit-browser-${run}`,
  MERIT_TURN_TASK_QUEUE: `merit-browser-turns-${run}`,
  MERIT_RECONCILE_SCHEDULE_ID: `merit-browser-reconcile-${run}`,
};
try {
  await migrate(database.client);
  await seedExampleRounds(drizzle(database.client));
  const result = spawnSync(
    "./node_modules/.bin/playwright",
    [
      "test",
      "--config",
      "tests/browser/workspace.playwright.config.ts",
      "--output",
      output,
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: await database.createRuntimeConnection(),
        MERIT_WORKSPACE_TEST_DATABASE_URL: database.connectionString,
        ...work,
        // Only the worker reads it; the web server keeps the origin it serves.
        MERIT_WORKER_APP_ORIGIN: workspaceOrigin,
      },
    },
  );
  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  try {
    // The worker's Schedule outlives it, and would keep firing on a queue nothing polls. A bad
    // Temporal configuration or an unreachable server must not keep the database from disposal.
    const client = createWorkflowClient(readTemporalConfig(process.env, { local: true }));
    try {
      // A server that accepts the connection and stops answering must not hold cleanup, so the
      // request has a deadline.
      await client.connection.withDeadline(Date.now() + scheduleDeleteDeadlineMs, () =>
        client.schedule.getHandle(work.MERIT_RECONCILE_SCHEDULE_ID).delete(),
      );
    } catch {
      // Temporal was not reached, did not answer in time, or the worker never created the Schedule.
    }
    await client.connection.close().catch(() => undefined);
  } catch {
    // The Temporal configuration is invalid, so there is no Schedule to delete.
  } finally {
    await database.dispose();
  }
}
