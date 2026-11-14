import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { createRequestDatabase, withDatabase } from "./connection";

const { clients, mockDrizzle, nextConnectError } = vi.hoisted(() => {
  type FakeClientRecord = {
    connectionString: string;
    connect: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    emitError: (error: Error) => void;
  };

  const records: FakeClientRecord[] = [];
  const drizzleFn = vi.fn((client: unknown) => ({ client }));
  const connectError: { current?: Error } = {};

  return {
    clients: records,
    mockDrizzle: drizzleFn,
    nextConnectError: connectError,
  };
});

vi.mock("pg", () => {
  class FakeClient {
    connectionString: string;
    connect = vi.fn(async () => {
      const error = nextConnectError.current;
      if (error) {
        nextConnectError.current = undefined;
        throw error;
      }
    });
    end = vi.fn(async () => undefined);
    private listeners = new Map<string, Array<(error: Error) => void>>();
    on = vi.fn((event: string, handler: (error: Error) => void) => {
      const current = this.listeners.get(event) ?? [];
      current.push(handler);
      this.listeners.set(event, current);
      return this;
    });

    constructor(options: { connectionString: string }) {
      this.connectionString = options.connectionString;
      clients.push({
        connectionString: options.connectionString,
        connect: this.connect,
        end: this.end,
        on: this.on,
        emitError: (error: Error) => {
          for (const handler of this.listeners.get("error") ?? []) {
            handler(error);
          }
        },
      });
    }
  }

  return { Client: FakeClient };
});

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: mockDrizzle,
}));

beforeEach(() => {
  clients.length = 0;
  nextConnectError.current = undefined;
  mockDrizzle.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

it("does not open or close a pg.Client when a request performs no database operations", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/merit");

  await requestDb.close();
  await requestDb.close();

  expect(clients).toHaveLength(0);
  expect(mockDrizzle).not.toHaveBeenCalled();
});

it("lazily opens one pg.Client, reuses it across sequential operations, and closes it once", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/request-a");

  expect(clients).toHaveLength(0);

  const first = await requestDb.run(async (db) => ({ step: 1, db }));
  const second = await requestDb.run(async (db) => ({ step: 2, db }));

  expect(clients).toHaveLength(1);
  expect(clients[0]!.connect).toHaveBeenCalledOnce();
  expect(clients[0]!.end).not.toHaveBeenCalled();
  expect(first.db).toBe(second.db);

  await requestDb.close();
  await requestDb.close();

  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("serializes concurrent operations on the request-scoped client and waits before closing", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/concurrent");
  const events: string[] = [];

  let markStarted!: () => void;
  const op1Started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const op1 = requestDb.run(async () => {
    events.push("op1:start");
    markStarted();
    await firstGate;
    events.push("op1:end");
    return "first";
  });

  const op2 = requestDb.run(async () => {
    events.push("op2:start");
    events.push("op2:end");
    return "second";
  });

  await op1Started;
  expect(events).toEqual(["op1:start"]);

  const closing = requestDb.close();
  await Promise.resolve();
  expect(clients[0]!.end).not.toHaveBeenCalled();

  releaseFirst();
  expect(await op1).toBe("first");
  await expect(op2).rejects.toThrow("Request database is closed.");
  await closing;

  expect(events).toEqual(["op1:start", "op1:end"]);
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("runs concurrent queued operations strictly sequentially when not closed", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/queued");
  const events: string[] = [];

  let markStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = requestDb.run(async () => {
    events.push("first:start");
    markStarted();
    await firstGate;
    events.push("first:end");
    return 1;
  });

  const second = requestDb.run(async () => {
    events.push("second:start");
    events.push("second:end");
    return 2;
  });

  await firstStarted;
  expect(events).toEqual(["first:start"]);

  releaseFirst();
  expect(await Promise.all([first, second])).toEqual([1, 2]);
  expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  expect(clients).toHaveLength(1);

  await requestDb.close();
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("keeps subsequent operations and close working when an operation fails", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/errors");

  await expect(
    requestDb.run(async () => {
      throw new Error("query failed");
    }),
  ).rejects.toThrow("query failed");

  expect(await requestDb.run(async () => "recovered")).toBe("recovered");
  expect(clients).toHaveLength(1);
  expect(clients[0]!.end).not.toHaveBeenCalled();

  await requestDb.close();
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("cleans up a failed connection attempt and rejects operations after close", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/connect-fail");
  nextConnectError.current = new Error("connection refused");

  await expect(requestDb.run(async () => "unreachable")).rejects.toThrow("connection refused");
  expect(clients).toHaveLength(1);
  expect(clients[0]!.end).toHaveBeenCalledOnce();

  expect(await requestDb.run(async () => "reconnected")).toBe("reconnected");
  expect(clients).toHaveLength(2);

  await requestDb.close();
  expect(clients[1]!.end).toHaveBeenCalledOnce();

  await expect(requestDb.run(async () => "after-close")).rejects.toThrow(
    "Request database is closed.",
  );
  expect(clients).toHaveLength(2);
});

it("isolates pg.Client instances across separate request databases", async () => {
  const reqA = createRequestDatabase("postgres://merit:merit@localhost/db");
  const reqB = createRequestDatabase("postgres://merit:merit@localhost/db");

  const [dbA, dbB] = await Promise.all([reqA.run(async (db) => db), reqB.run(async (db) => db)]);

  expect(clients).toHaveLength(2);
  expect(dbA).not.toBe(dbB);

  await Promise.all([reqA.close(), reqB.close()]);
  expect(clients[0]!.end).toHaveBeenCalledOnce();
  expect(clients[1]!.end).toHaveBeenCalledOnce();
});

it("keeps withDatabase creating and closing one client per standalone call", async () => {
  const result = await withDatabase("postgres://merit:merit@localhost/standalone", async (db) => ({
    ok: true,
    db,
  }));

  expect(result.ok).toBe(true);
  expect(clients).toHaveLength(1);
  expect(clients[0]!.connect).toHaveBeenCalledOnce();
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});
