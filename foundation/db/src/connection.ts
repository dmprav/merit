import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import { SpanKind, withSpan } from "@merit/telemetry";
import { reportError } from "@merit/telemetry/errors";

export type Database = NodePgDatabase;

export type DatabaseRunner = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

export type RequestDatabase = {
  run: DatabaseRunner;
  close: () => Promise<void>;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const createClient = (connectionString: string) => {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  if (typeof client.on === "function") {
    client.on("error", () => undefined);
  }

  return client;
};

const executeWithClient = async <T>(
  connectionString: string,
  operation: (db: Database) => Promise<T>,
): Promise<T> => {
  const client = createClient(connectionString);
  let completed = false;

  try {
    await withSpan("db.connect", () => client.connect(), {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "postgresql" },
    });
    const result = await operation(drizzle(client));
    completed = true;
    return result;
  } finally {
    if (completed) {
      await client.end();
    } else {
      await client.end().catch(() => undefined);
    }
  }
};

/** Independent queries use one read-only snapshot. A supplied transaction retains its caller's mode. */
export const readTransaction = <T>(
  db: Database,
  read: (tx: Transaction) => Promise<T>,
): Promise<T> =>
  withSpan(
    "db.transaction.read_only",
    () => db.transaction(read, { isolationLevel: "repeatable read", accessMode: "read only" }),
    {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "postgresql", "db.transaction.access_mode": "read_only" },
    },
  );

export const withDatabase = <T>(
  connectionString: string,
  operation: (db: Database) => Promise<T>,
): Promise<T> => executeWithClient(connectionString, operation);

/** One pool per Node server process. An operation owns its checkout until its work settles. */
export const createDatabasePool = (connectionString: string): DatabaseRunner => {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    allowExitOnIdle: true,
  });

  const onError = (error: Error) => reportError(error, { surface: "server", operation: "db.pool" });

  pool.on("error", onError);
  return async (operation) => {
    const client = await withSpan("db.connect", () => pool.connect(), {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "postgresql" },
    });
    client.on("error", onError);
    let completed = false;
    try {
      const result = await operation(drizzle(client));
      completed = true;
      return result;
    } finally {
      client.off("error", onError);
      client.release(!completed);
    }
  };
};

/** Submit operations directly to the pool and drain accepted work when the request closes. */
export const createRequestDatabase = (execute: DatabaseRunner): RequestDatabase => {
  let closed = false;
  const pending = new Set<Promise<unknown>>();

  const run: DatabaseRunner = async (operation) => {
    if (closed) {
      throw new Error("Request database is closed.");
    }

    const work = withSpan("db.execute", () => execute(operation), {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "postgresql" },
    });
    pending.add(work);
    try {
      return await work;
    } finally {
      pending.delete(work);
    }
  };

  const close = async () => {
    closed = true;
    await Promise.allSettled(pending);
  };

  return { run, close };
};
