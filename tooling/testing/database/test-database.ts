import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { migrate as migrateDatabase } from "@merit/db/migrate";
import { grantRuntimePrivileges } from "@merit/db/runtime-grants";

import { loadRepoEnvLocal } from "../env.ts";

export const createTestDatabase = async () => {
  loadRepoEnvLocal();
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit",
  );
  const admin = new Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  await admin.connect();

  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }

  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });

  const role = name + "_runtime";

  const migrate = () => migrateDatabase(client);

  const createRuntimeConnection = async () => {
    const password = randomUUID();
    await client.query(`CREATE ROLE "${role}" LOGIN NOBYPASSRLS PASSWORD '${password}'`);
    await grantRuntimePrivileges(client, role);
    const runtime = new URL(url);
    runtime.username = role;
    runtime.password = password;
    return runtime.href;
  };

  const dispose = async () => {
    try {
      await client.end();
      // FORCE ends this database's sessions, so an interrupted CREATE ROLE has committed or rolled
      // back by now; drop the role even when its creation was never acknowledged.
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    } finally {
      await admin.end();
    }
  };

  try {
    await client.connect();
    return { client, connectionString: url.href, migrate, createRuntimeConnection, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
};
