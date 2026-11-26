import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";

import { migrate } from "@merit/db/migrate";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { createTestDatabase } from "@merit/test-support/test-database";
import { createWorkflowClient, readTemporalConfig } from "@merit/workflows/client";

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
        MERIT_WORKER_APP_ORIGIN: "http://127.0.0.1:3002",
      },
    },
  );
  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  // The worker's Schedule outlives it, and would keep firing on a queue nothing polls.
  try {
    const client = createWorkflowClient(readTemporalConfig(process.env, { local: true }));
    await client.schedule.getHandle(work.MERIT_RECONCILE_SCHEDULE_ID).delete();
  } catch {
    // Temporal was not reached or the worker never created the Schedule.
  }
  await database.dispose();
}
