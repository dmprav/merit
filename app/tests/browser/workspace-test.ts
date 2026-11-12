import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import { seedExampleRounds } from "@merit/grantmaking/testing";
import { test as base } from "@merit/test-support/browser";

export { expect } from "@playwright/test";

export const test = base.extend<{ workspaceDatabase: Client }>({
  workspaceDatabase: [
    // Playwright requires destructured fixture dependencies, even when there are none.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const connectionString = process.env.MERIT_WORKSPACE_TEST_DATABASE_URL;
      if (!connectionString || !/^\/test_[a-f0-9]{32}$/.test(new URL(connectionString).pathname)) {
        throw new Error("Run workspace browser tests through @merit/app#test:workspace.");
      }

      // The host and browser tests share this disposable database, with one worker.
      const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
      await client.connect();

      try {
        await client.query("TRUNCATE organizations, app_users CASCADE");
        await seedExampleRounds(drizzle(client));
        await use(client);
      } finally {
        await client.end();
      }
    },
    { auto: true },
  ],
});
