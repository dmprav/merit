import { env } from "cloudflare:workers";

import { withDatabase as connect, type Database } from "@merit/db";

export const withDatabase = <T>(operation: (db: Database) => Promise<T>) => {
  return connect(env.HYPERDRIVE.connectionString, operation);
};
