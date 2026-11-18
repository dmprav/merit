import { Client } from "pg";

import { migrate } from "../database/migrate";
import { grantRuntimePrivileges } from "../database/runtime-grants";

const composeDatabase = "postgres://merit:merit@127.0.0.1:55432/merit";
const connectionString = process.env.DATABASE_URL ?? composeDatabase;
const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await migrate(client);
  if (connectionString === composeDatabase) {
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
