import { randomUUID } from "node:crypto";

import { Client } from "pg";

export const createTestDatabase = async () => {
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

  const dispose = async () => {
    try {
      await client.end();
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };

  try {
    await client.connect();
    return { client, connectionString: url.href, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
};
