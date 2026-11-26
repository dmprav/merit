import { Client } from "pg";
import { expect, it, onTestFinished } from "vite-plus/test";

import { createTestDatabase } from "./test-database";

it("drops the runtime role even when its creation was never acknowledged", async () => {
  const database = await createTestDatabase();
  let disposal: Promise<void> | undefined;

  const dispose = () => (disposal ??= database.dispose());

  onTestFinished(dispose);

  const role = `${new URL(database.connectionString).pathname.slice(1)}_runtime`;
  const admin = new Client({
    connectionString:
      process.env.TEST_DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit",
  });
  await admin.connect();
  try {
    // Stands in for a CREATE ROLE that committed after disposal closed the connection, so its
    // reply never reached createRuntimeConnection().
    await admin.query(`CREATE ROLE "${role}"`);
    await dispose();

    const { rowCount } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    expect(rowCount).toBe(0);
  } finally {
    try {
      await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
      await admin.end();
    }
  }
});
