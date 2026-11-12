import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as migrateDrizzle } from "drizzle-orm/node-postgres/migrator";
import type { Client } from "pg";

export const migrate = async (client: Client) => {
  // Serialize deploys on this connection; Drizzle owns the migration transaction and history.
  await client.query("SELECT pg_advisory_lock(48219371)");

  try {
    await migrateDrizzle(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    });
  } finally {
    await client.query("SELECT pg_advisory_unlock(48219371)");
  }
};
