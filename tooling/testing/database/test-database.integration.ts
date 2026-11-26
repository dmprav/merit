import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { expect, it, onTestFinished, vi } from "vite-plus/test";

import { loadRepoEnvLocal } from "../env.ts";
import { createTestDatabase } from "./test-database";

const adminConnectionString = () => {
  loadRepoEnvLocal();
  return process.env.TEST_DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit";
};

it("drops the runtime role even when its creation was never acknowledged", async () => {
  const database = await createTestDatabase();
  let disposal: Promise<void> | undefined;

  const dispose = () => (disposal ??= database.dispose());

  onTestFinished(dispose);

  const role = `${new URL(database.connectionString).pathname.slice(1)}_runtime`;
  const admin = new Client({ connectionString: adminConnectionString() });
  await admin.connect();
  try {
    // Stands in for a CREATE ROLE that committed but whose reply never arrived: creation started,
    // and createRuntimeConnection() saw it fail.
    await admin.query(`CREATE ROLE "${role}"`);
    await expect(database.createRuntimeConnection()).rejects.toThrow("already exists");
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

it("disposes its database for a test user that may create databases but not roles", async () => {
  const adminUrl = adminConnectionString();
  const admin = new Client({ connectionString: adminUrl });
  const user = `test_${randomUUID().replaceAll("-", "")}_createdb`;
  const password = randomUUID();
  let name: string | undefined;
  await admin.connect();
  try {
    await admin.query(`CREATE ROLE "${user}" LOGIN CREATEDB PASSWORD '${password}'`);
    const url = new URL(adminUrl);
    url.username = user;
    url.password = password;
    vi.stubEnv("TEST_DATABASE_URL", url.href);
    const database = await createTestDatabase();
    vi.unstubAllEnvs();
    name = new URL(database.connectionString).pathname.slice(1);

    await expect(database.dispose()).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    try {
      if (name) {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
      await admin.query(`DROP ROLE IF EXISTS "${user}"`);
    } finally {
      await admin.end();
    }
  }
});
