import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import { SpanKind, withSpan } from "@merit/telemetry";

export type Database = NodePgDatabase;

export type DatabaseRunner = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

export type RequestDatabase = {
  run: DatabaseRunner;
  close: () => Promise<void>;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const createClient = (connectionString: string) =>
  new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

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

export const withDatabase = async <T>(
  connectionString: string,
  operation: (db: Database) => Promise<T>,
): Promise<T> => {
  const client = createClient(connectionString);

  try {
    await withSpan("db.connect", () => client.connect(), {
      kind: SpanKind.CLIENT,
      attributes: { "db.system": "postgresql" },
    });
    return await operation(drizzle(client));
  } finally {
    await client.end();
  }
};

/**
 * Lazily opens at most one pg.Client for a single HTTP request, serializes operations
 * (including transactions) on that client, and closes it when the request finishes.
 * Never share a RequestDatabase across HTTP requests.
 */
export const createRequestDatabase = (connectionString: string): RequestDatabase => {
  let client: Client | undefined;
  let db: Database | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  let queue: Promise<void> = Promise.resolve();

  const ensureConnected = async (): Promise<Database> => {
    if (db) {
      return db;
    }

    const nextClient = createClient(connectionString);
    if (typeof nextClient.on === "function") {
      nextClient.on("error", () => {
        if (client === nextClient) {
          client = undefined;
          db = undefined;
        }
      });
    }

    try {
      await withSpan("db.connect", () => nextClient.connect(), {
        kind: SpanKind.CLIENT,
        attributes: { "db.system": "postgresql" },
      });
    } catch (error) {
      await nextClient.end().catch(() => undefined);
      throw error;
    }

    client = nextClient;
    db = drizzle(nextClient);
    return db;
  };

  const run: DatabaseRunner = (operation) => {
    if (closed) {
      return Promise.reject(new Error("Request database is closed."));
    }

    const execution = queue.then(() =>
      withSpan(
        "db.execute",
        async () => {
          if (closed) {
            throw new Error("Request database is closed.");
          }

          const database = await ensureConnected();
          return operation(database);
        },
        {
          kind: SpanKind.CLIENT,
          attributes: { "db.system": "postgresql" },
        },
      ),
    );

    queue = execution.then(
      () => undefined,
      () => undefined,
    );

    return execution;
  };

  const close = () => {
    closed = true;
    return (closing ??= (async () => {
      await queue;
      if (client) {
        const active = client;
        client = undefined;
        db = undefined;
        await active.end();
      }
    })());
  };

  return { run, close };
};
