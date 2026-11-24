import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

import { migrate } from "../database/migrate";
import { grantRuntimePrivileges } from "../database/runtime-grants";

const rootEnvFile = resolve(import.meta.dirname, "../../..", ".env.local");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const composeDatabase = "postgres://merit:merit@127.0.0.1:55432/merit";
const connectionString = process.env.DATABASE_URL ?? composeDatabase;

const isLocalComposeOwner = (value: string) => {
  const url = URL.parse(value);
  return Boolean(
    url &&
    (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
    !url.searchParams.has("host") &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.port === "55432" &&
    url.username === "merit",
  );
};

const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await migrate(client);
  if (isLocalComposeOwner(connectionString)) {
    await client.query(`DO $$ BEGIN
      CREATE ROLE merit_runtime LOGIN PASSWORD 'merit';
      EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);
    await grantRuntimePrivileges(client, "merit_runtime");
  }
  console.log("Database migrations applied.");
} finally {
  await client.end();
}
