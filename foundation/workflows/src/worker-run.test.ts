import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { readTemporalConfig } from "./config.ts";
import { createWorker, createWorkers, describeError, runWorker, runWorkers } from "./worker.ts";

const sdk = vi.hoisted(() => ({
  connect: vi.fn(),
  install: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@temporalio/worker", () => ({
  DefaultLogger: class {},
  makeTelemetryFilterString: ({ core, other }: { core: string; other: string }) =>
    `${other},temporal_sdk_core=${core}`,
  NativeConnection: { connect: sdk.connect },
  Runtime: { install: sdk.install },
  Worker: { create: sdk.create },
}));

const config = { ...readTemporalConfig({}, { local: true }), apiKey: "secret-api-key", tls: true };
const settings = { config, taskQueue: "queue", workflows: { workflowsPath: "/workflows.ts" } };
const backoff = { initialMs: 1, maxMs: 2 };

const connection = { close: vi.fn(async () => {}) };

// The SDK shuts down only a running worker: `run()` enters that state before it returns.
const sdkWorker = (run: () => Promise<void> = async () => {}) => {
  const state = { running: false };
  return {
    state,
    run: vi.fn(() => {
      state.running = true;
      return run();
    }),
    shutdown: vi.fn(() => {
      if (!state.running) {
        throw new Error("Not running. Current state: INITIALIZED");
      }
    }),
  };
};

let worker = sdkWorker();

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

beforeEach(() => {
  vi.resetAllMocks();
  worker = sdkWorker();
  sdk.connect.mockResolvedValue(connection as never);
  sdk.create.mockImplementation(async () => worker as never);
  connection.close.mockResolvedValue(undefined);
});

describe("connecting", () => {
  it("retries with doubling backoff, then polls until the worker stops", async () => {
    const log = logger();
    sdk.connect
      .mockRejectedValueOnce(new Error("first\nfailure   here"))
      .mockRejectedValueOnce("not an error")
      .mockResolvedValue(connection as never);

    await runWorker(settings, { logger: log, backoff });

    expect(sdk.connect).toHaveBeenCalledWith({
      address: "127.0.0.1:7233",
      tls: true,
      apiKey: "secret-api-key",
    });
    expect(log.warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "Temporal at 127.0.0.1:7233 is unreachable (first failure here). Retrying in 0s.",
      "Temporal at 127.0.0.1:7233 is unreachable (unknown error). Retrying in 0s.",
    ]);
    expect(log.info).toHaveBeenCalledWith("Worker polling task queue queue in namespace default.");
    expect(worker.run).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
    expect(sdk.install).toHaveBeenCalledOnce();
    // The native core's logs reach the safe logger instead of the console, which would print task tokens.
    expect(sdk.install).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetryOptions: {
          logging: { forward: {}, filter: "ERROR,temporal_sdk_core=WARN" },
        },
      }),
    );
  });

  it("keeps the first runtime when one is already installed", async () => {
    sdk.install.mockImplementation(() => {
      throw new Error("already installed");
    });

    await expect(runWorker(settings, { logger: logger() })).resolves.toBeUndefined();
  });

  it("stops retrying when aborted while waiting", async () => {
    const abort = new AbortController();
    sdk.connect.mockImplementation(async () => {
      abort.abort();
      throw new Error("down");
    });

    await runWorker(settings, {
      logger: logger(),
      signal: abort.signal,
      backoff: { initialMs: 60_000, maxMs: 60_000 },
    });

    expect(sdk.connect).toHaveBeenCalledOnce();
    expect(sdk.create).not.toHaveBeenCalled();
  });
});

describe("running", () => {
  it("drains the worker when the signal aborts", async () => {
    const abort = new AbortController();
    worker = sdkWorker(async () => {
      abort.abort();
    });

    await runWorker(settings, { logger: logger(), signal: abort.signal });

    expect(worker.shutdown).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("drains at once when stopped while the worker was being created", async () => {
    const abort = new AbortController();
    sdk.create.mockImplementation(async () => {
      abort.abort();
      return worker as never;
    });
    worker.run.mockImplementation(() => {
      worker.state.running = true;
      return new Promise<void>((resolve) => {
        worker.shutdown.mockImplementation(() => resolve());
      });
    });

    await runWorker(settings, { logger: logger(), signal: abort.signal });

    // It started polling before it asked to stop, and it stopped: the run did not go on forever.
    expect(worker.run).toHaveBeenCalledOnce();
    expect(worker.shutdown).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("closes the connection and rejects when the worker cannot be built", async () => {
    sdk.create.mockRejectedValue(new Error("invalid workflow code"));

    await expect(runWorker(settings, { logger: logger() })).rejects.toThrow(
      "invalid workflow code",
    );
    expect(connection.close).toHaveBeenCalledOnce();
  });
});

describe("creating a worker", () => {
  it("encrypts payloads and registers the activities and workflows it is given", async () => {
    const activities = { send: async () => {} };

    await createWorker(connection as never, { ...settings, activities });

    expect(sdk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        connection,
        namespace: "default",
        taskQueue: "queue",
        workflowsPath: "/workflows.ts",
        activities,
      }),
    );
  });

  it("encrypts payloads and failure details", async () => {
    await createWorker(connection as never, settings);

    const { dataConverter } = sdk.create.mock.calls[0]![0] as {
      dataConverter: { payloadCodecs: unknown[]; failureConverterPath: string };
    };
    expect(dataConverter.payloadCodecs).toHaveLength(1);
    expect(dataConverter.failureConverterPath).toMatch(/failure-converter\.ts$/u);
  });

  it("omits activities when there are none", async () => {
    await createWorker(connection as never, settings);

    expect(sdk.create.mock.calls[0]?.[0]).not.toHaveProperty("activities");
  });
});

it("describes errors on one short line", () => {
  expect(describeError(new Error("a".repeat(500)))).toHaveLength(200);
});

describe("start-up work", () => {
  it("runs beside polling once the worker is connected", async () => {
    let release = () => {};

    const onConnected = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));

    const done = runWorker(settings, { logger: logger(), onConnected, backoff });
    // Polling has started while start-up work is still pending.
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
    expect(worker.run).toHaveBeenCalledOnce();
    release();
    await done;
  });

  it("stops without waiting for start-up work that never answers, and closes the connection after", async () => {
    const abort = new AbortController();
    const onConnected = vi.fn(() => new Promise<void>(() => {}));

    let finish = () => {};

    worker = sdkWorker(() => new Promise<void>((resolve) => (finish = resolve)));

    const done = runWorker(settings, {
      logger: logger(),
      signal: abort.signal,
      onConnected,
      backoff,
    });
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
    abort.abort();
    finish();
    await done;

    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("warns without failure details, keeps polling and retries until it succeeds", async () => {
    const log = logger();
    const onConnected = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("jo@example.test\nstack"))
      .mockRejectedValueOnce(new Error("again"))
      .mockResolvedValue(undefined);

    let finish = () => {};

    worker = sdkWorker(() => new Promise<void>((resolve) => (finish = resolve)));

    const done = runWorker(settings, { logger: log, onConnected, backoff });
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledTimes(3));
    finish();
    await done;

    expect(log.warn).toHaveBeenCalledWith(
      "Worker start-up work failed (jo@example.test stack). Retrying in 0s.",
    );
    expect(worker.run).toHaveBeenCalledOnce();
  });

  it("stops retrying when the worker is told to stop", async () => {
    const abort = new AbortController();
    const onConnected = vi.fn(async () => {
      throw new Error("down");
    });

    let finish = () => {};

    worker = sdkWorker(() => new Promise<void>((resolve) => (finish = resolve)));

    const done = runWorker(settings, {
      logger: logger(),
      signal: abort.signal,
      onConnected,
      backoff: { initialMs: 60_000, maxMs: 60_000 },
    });
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
    abort.abort();
    finish();
    await done;

    expect(onConnected).toHaveBeenCalledOnce();
  });
});

describe("further activity queues", () => {
  const queue = {
    taskQueue: "turns",
    activities: { turn: async () => {} },
    maxConcurrentActivities: 4,
  };

  it("polls each queue with its own concurrency limit and no workflows", async () => {
    await createWorkers(connection as never, { ...settings, activityQueues: [queue] });

    expect(sdk.create).toHaveBeenCalledTimes(2);
    expect(sdk.create.mock.calls[1]?.[0]).toMatchObject({
      taskQueue: "turns",
      activities: queue.activities,
      maxConcurrentActivityTaskExecutions: 4,
    });
    expect(sdk.create.mock.calls[1]?.[0]).not.toHaveProperty("workflowsPath");
  });

  it("passes the shutdown force time to every worker", async () => {
    await createWorkers(connection as never, {
      ...settings,
      activityQueues: [queue],
      shutdownForceTime: "1s",
    });

    expect(sdk.create.mock.calls.map((call) => call[0] as object)).toEqual([
      expect.objectContaining({ shutdownForceTime: "1s" }),
      expect.objectContaining({ shutdownForceTime: "1s" }),
    ]);
  });

  it("stops the created workers when a later one cannot be built, started first so they can", async () => {
    let stopped = false;
    worker = sdkWorker(
      () =>
        new Promise<void>((resolve) => {
          worker.shutdown.mockImplementation(() => {
            stopped = true;
            resolve();
          });
        }),
    );
    sdk.create
      .mockImplementationOnce(async () => worker as never)
      .mockRejectedValueOnce(new Error("invalid"));

    await expect(
      createWorkers(connection as never, { ...settings, activityQueues: [queue] }),
    ).rejects.toThrow("invalid");
    expect(worker.run).toHaveBeenCalledOnce();
    expect(worker.shutdown).toHaveBeenCalledOnce();
    // The rejection waited for the worker to stop, so the connection can close.
    expect(stopped).toBe(true);
  });

  it("announces every queue and stops them all when one worker fails", async () => {
    const log = logger();
    const failing = sdkWorker(() => Promise.reject(new Error("crashed")));
    sdk.create
      .mockImplementationOnce(async () => worker as never)
      .mockImplementationOnce(async () => failing as never);
    // The sibling drains on request: its run settles once it is told to stop.
    worker.run.mockImplementation(() => {
      worker.state.running = true;
      return new Promise<void>((resolve) => {
        worker.shutdown.mockImplementation(() => resolve());
      });
    });

    await expect(
      runWorker({ ...settings, activityQueues: [queue] }, { logger: log }),
    ).rejects.toThrow("crashed");

    expect(log.info).toHaveBeenCalledWith(
      "Worker polling task queue queue, turns in namespace default.",
    );
    expect(worker.shutdown).toHaveBeenCalled();
  });

  it("waits for a sibling to finish draining before rejecting with the failure", async () => {
    const events: string[] = [];
    const failing = sdkWorker(() => Promise.reject(new Error("crashed")));
    const draining = sdkWorker(
      () =>
        new Promise<void>((resolve) => {
          draining.shutdown.mockImplementation(() => {
            events.push("shutdown requested");
            setTimeout(() => {
              events.push("sibling drained");
              resolve();
            }, 5);
          });
        }),
    );

    const failure = runWorkers([failing, draining] as never).catch((error: unknown) => {
      events.push(`rejected: ${(error as Error).message}`);
    });
    await failure;

    expect(events).toEqual(["shutdown requested", "sibling drained", "rejected: crashed"]);
  });

  it("tolerates a worker that already stopped", async () => {
    const crashed = sdkWorker(() => Promise.reject(new Error("crashed")));
    crashed.shutdown.mockImplementation(() => {
      throw new Error("Not running");
    });

    await expect(runWorkers([crashed as never])).rejects.toThrow("crashed");
  });
});
