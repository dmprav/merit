import { afterEach, beforeEach, expect, it, vi, type Mock } from "vite-plus/test";

import { createRequestDatabase, withDatabase } from "./connection";

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
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/merit");

  await requestDb.close();
  await requestDb.close();

  expect(clients).toHaveLength(0);
  expect(mockDrizzle).not.toHaveBeenCalled();
});

it("checks out and closes a fresh pg.Client per sequential operation without holding it open", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/request-a");

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
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/parallel");
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

it("bounds concurrent operations to maxConcurrency and drains queued overflow", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/bounded", {
    maxConcurrency: 2,
  });
  const events: string[] = [];

  let markOp1Started!: () => void;
  const op1Started = new Promise<void>((resolve) => {
    markOp1Started = resolve;
  });
  let markOp2Started!: () => void;
  const op2Started = new Promise<void>((resolve) => {
    markOp2Started = resolve;
  });
  let releaseOp1!: () => void;
  const op1Gate = new Promise<void>((resolve) => {
    releaseOp1 = resolve;
  });
  let releaseOp2!: () => void;
  const op2Gate = new Promise<void>((resolve) => {
    releaseOp2 = resolve;
  });

  const op1 = requestDb.run(async () => {
    events.push("op1:start");
    markOp1Started();
    await op1Gate;
    events.push("op1:end");
    return 1;
  });
  const op2 = requestDb.run(async () => {
    events.push("op2:start");
    markOp2Started();
    await op2Gate;
    events.push("op2:end");
    return 2;
  });
  const op3 = requestDb.run(async () => {
    events.push("op3:start");
    events.push("op3:end");
    return 3;
  });

  await Promise.all([op1Started, op2Started]);
  await Promise.resolve();
  expect(clients).toHaveLength(2);
  expect(events).toEqual(["op1:start", "op2:start"]);

  releaseOp1();
  expect(await op1).toBe(1);
  expect(await op3).toBe(3);
  expect(clients).toHaveLength(3);

  releaseOp2();
  expect(await op2).toBe(2);
  expect(clients.every((client) => client.end.mock.calls.length === 1)).toBe(true);

  await requestDb.close();
});

it("rejects queued waiters on close and waits for active operations to close their clients", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/concurrent", {
    maxConcurrency: 1,
  });
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
    return "second";
  });

  await op1Started;
  expect(events).toEqual(["op1:start"]);

  let closeResolved = false;
  const closing = requestDb.close().then(() => {
    closeResolved = true;
  });

  await expect(op2).rejects.toThrow("Request database is closed.");
  expect(closeResolved).toBe(false);
  expect(clients[0]!.end).not.toHaveBeenCalled();

  releaseFirst();
  expect(await op1).toBe("first");
  await closing;

  expect(closeResolved).toBe(true);
  expect(events).toEqual(["op1:start", "op1:end"]);
  expect(clients).toHaveLength(1);
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("does not open a client when close happens during a slot handoff", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/handoff", {
    maxConcurrency: 1,
  });

  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  let releaseEnd!: () => void;
  const endGate = new Promise<void>((resolve) => {
    releaseEnd = resolve;
  });

  let markEnding!: () => void;
  const ending = new Promise<void>((resolve) => {
    markEnding = resolve;
  });

  const first = requestDb.run(async () => {
    clients[0]!.end.mockImplementationOnce(() => {
      markEnding();
      return endGate;
    });
    markStarted();
    return "first";
  });

  await started;
  const second = requestDb.run(async () => "second");

  await ending;
  // Attach close() to endGate after executeWithClient's await so it runs right after release() wakes second.
  const closeAfterHandoff = endGate.then(() => requestDb.close());
  releaseEnd();

  await expect(first).resolves.toBe("first");
  await expect(second).rejects.toThrow("Request database is closed.");
  await closeAfterHandoff;

  expect(clients).toHaveLength(1);
  expect(clients[0]!.end).toHaveBeenCalledOnce();
});

it("keeps subsequent operations working and preserves operation errors when cleanup fails", async () => {
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/errors");

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
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/connect-fail");
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
  const requestDb = createRequestDatabase("postgres://merit:merit@localhost/closed");
  const operation = vi.fn(async () => "after-close");
  await requestDb.close();

  await expect(requestDb.run(operation)).rejects.toThrow("Request database is closed.");
  expect(operation).not.toHaveBeenCalled();
  expect(clients).toHaveLength(0);
});

it("rejects non-positive or non-integer maxConcurrency", () => {
  expect(() =>
    createRequestDatabase("postgres://merit:merit@localhost/invalid", { maxConcurrency: 0 }),
  ).toThrow(RangeError);
  expect(() =>
    createRequestDatabase("postgres://merit:merit@localhost/invalid", { maxConcurrency: 1.5 }),
  ).toThrow(RangeError);
});

it("keeps another request's database open when one request closes its own", async () => {
  const reqA = createRequestDatabase("postgres://merit:merit@localhost/db");
  const reqB = createRequestDatabase("postgres://merit:merit@localhost/db");

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
