import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import { SpanKind, withSpan } from "@merit/telemetry";

export type Database = NodePgDatabase;

export type DatabaseRunner = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

export type RequestDatabase = {
  run: DatabaseRunner;
  close: () => Promise<void>;
};

export type RequestDatabaseOptions = {
  maxConcurrency?: number;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type SlotWaiter = {
  resolve: (acquired: boolean) => void;
};

const DEFAULT_MAX_CONCURRENCY = 4;

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

const createConcurrencyGate = (maxConcurrency: number) => {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError("maxConcurrency must be a positive integer.");
  }

  let active = 0;
  let closed = false;
  let closing: Promise<void> | undefined;
  let resolveDrained: (() => void) | undefined;
  const waiters: SlotWaiter[] = [];

  const acquire = (): Promise<boolean> => {
    if (closed) {
      return Promise.resolve(false);
    }
    if (active < maxConcurrency) {
      active += 1;
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      waiters.push({ resolve });
    });
  };

  const release = () => {
    const next = waiters.shift();
    if (next) {
      next.resolve(!closed);
      if (!closed) {
        return;
      }
    }

    active -= 1;
    if (closed && active === 0) {
      resolveDrained?.();
    }
  };

  const close = () => {
    closed = true;
    while (waiters.length > 0) {
      waiters.shift()!.resolve(false);
    }

    return (closing ??=
      active === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            resolveDrained = resolve;
          }));
  };

  return { acquire, release, close, isClosed: () => closed };
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

/**
 * Checks out a short-lived pg.Client per operation with bounded per-request concurrency,
 * allowing parallel SSR reads across Hyperdrive without holding connections open across
 * external HTTP calls or exceeding Worker socket limits.
 * Never share a RequestDatabase across HTTP requests.
 */
export const createRequestDatabase = (
  connectionString: string,
  options?: RequestDatabaseOptions,
): RequestDatabase => {
  const gate = createConcurrencyGate(options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

  const run: DatabaseRunner = async (operation) => {
    const acquired = await gate.acquire();
    if (!acquired) {
      throw new Error("Request database is closed.");
    }

    try {
      if (gate.isClosed()) {
        throw new Error("Request database is closed.");
      }

      return await withSpan("db.execute", () => executeWithClient(connectionString, operation), {
        kind: SpanKind.CLIENT,
        attributes: { "db.system": "postgresql" },
      });
    } finally {
      gate.release();
    }
  };

  return { run, close: gate.close };
};
