import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrate } from "@merit/db/migrate";
import { createTestDatabase } from "@merit/test-support/test-database";

import { loadRepoEnvLocal } from "./browser/ports.ts";

loadRepoEnvLocal();

const database = await createTestDatabase();
try {
  await migrate(database.client);
  const result = spawnSync(
    "./node_modules/.bin/playwright",
    [
      "test",
      "--config",
      "tests/browser/playwright.config.ts",
      "--output",
      join(tmpdir(), `merit-demo-browser-${new URL(database.connectionString).pathname.slice(1)}`),
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: await database.createRuntimeConnection() },
    },
  );
  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  await database.dispose();
}
