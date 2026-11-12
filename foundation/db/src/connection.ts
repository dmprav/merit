import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";

export type Database = NodePgDatabase;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Independent queries use one read-only snapshot. A supplied transaction retains its caller's mode. */
export const readTransaction = <T>(
  db: Database,
  read: (tx: Transaction) => Promise<T>,
): Promise<T> =>
  db.transaction(read, { isolationLevel: "repeatable read", accessMode: "read only" });

export const withDatabase = async <T>(
  connectionString: string,
  operation: (db: Database) => Promise<T>,
): Promise<T> => {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    await client.connect();
    return await operation(drizzle(client));
  } finally {
    await client.end();
  }
};
