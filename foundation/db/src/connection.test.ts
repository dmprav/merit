import { afterEach, beforeEach, expect, it, vi, type Mock } from "vite-plus/test";

import { createRequestDatabase, withDatabase, type DatabaseRunner } from "./connection";

const openTestRequest = (connectionString: string) =>
  createRequestDatabase((operation) => withDatabase(connectionString, operation));

const { clients, mockDrizzle, nextConnectError } = vi.hoisted(() => {
  type FakeClientRecord = {
    connectionString: string;
    connect: Mock<() => Promise<void>>;
    end: Mock<() => Promise<void>>;
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
    connect = vi.fn<() => Promise<void>>(async () => {
      const error = nextConnectError.current;
      if (error) {
        nextConnectError.current = undefined;
        throw error;
      }
    });
    end = vi.fn<() => Promise<void>>(async () => undefined);
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
  const requestDb = openTestRequest("postgres://merit:merit@localhost/merit");

  await requestDb.close();
  await requestDb.close();

  expect(clients).toHaveLength(0);
  expect(mockDrizzle).not.toHaveBeenCalled();
});

it("checks out and closes a fresh pg.Client per sequential operation without holding it open", async () => {
  const requestDb = openTestRequest("postgres://merit:merit@localhost/request-a");

  expect(clients).toHaveLength(0);

  const first = await requestDb.run(async (db) => ({ step: 1, db }));
  expect(clients).toHaveLength(1);
  expect(clients[0]!.connect).toHaveBeenCalledOnce();
  expect(clients[0]!.end).toHaveBeenCalledOnce();

  const second = await requestDb.run(async (db) => ({ step: 2, db }));
  expect(clients).toHaveLength(2);
  expect(clients[1]!.connect).toHaveBeenCalledOnce();
  expect(clients[1]!.end).toHaveBeenCalledOnce();
  expect(first.db).not.toBe(second.db);

  await requestDb.close();
  await requestDb.close();

  expect(clients[0]!.end).toHaveBeenCalledOnce();
  expect(clients[1]!.end).toHaveBeenCalledOnce();
});

it("runs concurrent operations in parallel without serializing them", async () => {
  const requestDb = openTestRequest("postgres://merit:merit@localhost/parallel");
  const events: string[] = [];

  let markFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });

  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = requestDb.run(async (db) => {
    events.push("first:start");
    markFirstStarted();
    await firstGate;
    events.push("first:end");
    return db;
  });

  await firstStarted;

  const second = requestDb.run(async (db) => {
    events.push("second:start");
    events.push("second:end");
    return db;
  });

  const secondDb = await second;
  expect(events).toEqual(["first:start", "second:start", "second:end"]);
  expect(clients).toHaveLength(2);
  expect(clients[0]!.end).not.toHaveBeenCalled();
  expect(clients[1]!.end).toHaveBeenCalledOnce();

  releaseFirst();
  const firstDb = await first;
  expect(firstDb).not.toBe(secondDb);
  expect(events).toEqual(["first:start", "second:start", "second:end", "first:end"]);
  expect(clients[0]!.end).toHaveBeenCalledOnce();

  await requestDb.close();
});

it("submits more than four checkouts to the pool and drains pending checkouts on close", async () => {
  let release!: () => void;
  const waitingForPool = new Promise<void>((resolve) => {
    release = resolve;
  });
  let checkouts = 0;

  const execute: DatabaseRunner = async (operation) => {
    checkouts += 1;
    await waitingForPool;
    return withDatabase("postgres://merit:merit@localhost/pool", operation);
  };

  const request = createRequestDatabase(execute);
  const operations = Array.from({ length: 8 }, (_, index) => request.run(async () => index));

  expect(checkouts).toBe(8);
  const closing = request.close();
  await expect(request.run(async () => "late")).rejects.toThrow("Request database is closed.");
  expect(checkouts).toBe(8);
  release();

  await closing;
  expect(clients).toHaveLength(8);
  expect(clients.every((client) => client.end.mock.calls.length === 1)).toBe(true);
  await expect(Promise.all(operations)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

it("drains failing work without replacing the operation error or rejecting close", async () => {
  const request = openTestRequest("postgres://merit:merit@localhost/closing");
  const operation = request.run(async () => {
    throw new Error("query failed");
  });
  const closing = Promise.all([request.close(), request.close()]);
  await expect(operation).rejects.toThrow("query failed");
  await closing;
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("keeps subsequent operations working and preserves operation errors when cleanup fails", async () => {
  const requestDb = openTestRequest("postgres://merit:merit@localhost/errors");

  await expect(
    requestDb.run(async () => {
      clients[0]!.end.mockRejectedValueOnce(new Error("close failed"));
      throw new Error("query failed");
    }),
  ).rejects.toThrow("query failed");
  expect(clients[0]!.end).toHaveBeenCalledOnce();

  expect(await requestDb.run(async () => "recovered")).toBe("recovered");
  expect(clients).toHaveLength(2);
  expect(clients[1]!.end).toHaveBeenCalledOnce();

  await requestDb.close();
});

it("cleans up a failed connection attempt and connects again for the next operation", async () => {
  const requestDb = openTestRequest("postgres://merit:merit@localhost/connect-fail");
  nextConnectError.current = new Error("connection refused");

  await expect(requestDb.run(async () => "unreachable")).rejects.toThrow("connection refused");
  expect(clients).toHaveLength(1);
  expect(clients[0]!.end).toHaveBeenCalledOnce();

  expect(await requestDb.run(async () => "reconnected")).toBe("reconnected");
  expect(clients).toHaveLength(2);
  expect(clients[1]!.end).toHaveBeenCalledOnce();

  await requestDb.close();
});

it("rejects operations after close without opening a client", async () => {
  const requestDb = openTestRequest("postgres://merit:merit@localhost/closed");
  const operation = vi.fn(async () => "after-close");
  await requestDb.close();

  await expect(requestDb.run(operation)).rejects.toThrow("Request database is closed.");
  expect(operation).not.toHaveBeenCalled();
  expect(clients).toHaveLength(0);
});

it("keeps another request's database open when one request closes its own", async () => {
  const reqA = openTestRequest("postgres://merit:merit@localhost/db");
  const reqB = openTestRequest("postgres://merit:merit@localhost/db");

  expect(await reqA.run(async () => "a")).toBe("a");
  await reqA.close();

  await expect(reqB.run(async () => "b")).resolves.toBe("b");
  expect(clients).toHaveLength(2);
  await reqB.close();
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
