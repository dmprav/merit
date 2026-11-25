import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { readTemporalConfig } from "./config.ts";
import { createWorker, describeError, runWorker } from "./worker.ts";

const sdk = vi.hoisted(() => ({
  connect: vi.fn(),
  install: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@temporalio/worker", () => ({
  DefaultLogger: class {},
  NativeConnection: { connect: sdk.connect },
  Runtime: { install: sdk.install },
  Worker: { create: sdk.create },
}));

const config = { ...readTemporalConfig({}, { local: true }), apiKey: "secret-api-key", tls: true };
const settings = { config, taskQueue: "queue", workflows: { workflowsPath: "/workflows.ts" } };
const backoff = { initialMs: 1, maxMs: 2 };

const connection = { close: vi.fn(async () => {}) };
const worker = { run: vi.fn(async () => {}), shutdown: vi.fn() };

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

beforeEach(() => {
  vi.resetAllMocks();
  sdk.connect.mockResolvedValue(connection as never);
  sdk.create.mockResolvedValue(worker as never);
  worker.run.mockResolvedValue(undefined);
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
    worker.run.mockImplementation(async () => {
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

    await runWorker(settings, { logger: logger(), signal: abort.signal });

    expect(worker.shutdown).toHaveBeenCalledOnce();
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

    expect(sdk.create).toHaveBeenCalledWith({
      connection,
      namespace: "default",
      taskQueue: "queue",
      dataConverter: { payloadCodecs: [expect.anything()] },
      workflowsPath: "/workflows.ts",
      activities,
    });
  });

  it("omits activities when there are none", async () => {
    await createWorker(connection as never, settings);

    expect(sdk.create.mock.calls[0]?.[0]).not.toHaveProperty("activities");
  });
});

it("describes errors on one short line", () => {
  expect(describeError(new Error("a".repeat(500)))).toHaveLength(200);
});
