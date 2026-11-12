import { Client } from "pg";

import { migrate } from "../database/migrate";

const connectionString = process.env.DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit";
const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await migrate(client);
  console.log("Database migrations applied.");
} finally {
  await client.end();
}
