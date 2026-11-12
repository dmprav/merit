import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";

import { migrate } from "@merit/db/migrate";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { createTestDatabase } from "@merit/test-support/test-database";

const database = await createTestDatabase();
const output = join(
  tmpdir(),
  `merit-workspace-browser-${new URL(database.connectionString).pathname.slice(1)}`,
);
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
        DATABASE_URL: database.connectionString,
        MERIT_WORKSPACE_TEST_DATABASE_URL: database.connectionString,
      },
    },
  );
  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  await database.dispose();
}
