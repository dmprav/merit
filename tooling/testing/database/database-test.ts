import { drizzle } from "drizzle-orm/node-postgres";
import { test } from "vite-plus/test";

import { migrate } from "@merit/db/migrate";

import { createTestDatabase } from "./test-database";

// Tests in a file share one database and must run sequentially.
export const databaseTest = test
  // Vitest requires destructured fixture dependencies, even when there are none.
  // oxlint-disable-next-line no-empty-pattern
  .extend("database", { scope: "file" }, async ({}, { onCleanup }) => {
    const database = await createTestDatabase();
    onCleanup(() => database.dispose());
    await migrate(database.client);
    return database;
  })
  .extend("db", { auto: true }, async ({ database }) => {
    await database.client.query("TRUNCATE organizations, app_users CASCADE");
    return drizzle(database.client);
  });
