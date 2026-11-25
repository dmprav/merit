import { describe, expect, it, vi } from "vite-plus/test";

import { readTemporalConfig } from "./config.ts";
import { connectionOptions, createWorkflowClient } from "./connection.ts";
import { runWorker, type WorkerLogger } from "./worker.ts";

// Nothing listens on this loopback port, so connecting fails the way an absent server does.
const unreachable = {
  ...readTemporalConfig({}, { local: true }),
  address: "127.0.0.1:1",
  apiKey: "secret-api-key",
};

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) satisfies WorkerLogger;

describe("an unreachable Temporal service", () => {
  it("retries with growing backoff and logs without credentials until stopped", async () => {
    const log = logger();
    const abort = new AbortController();
    log.warn.mockImplementation(() => {
      if (log.warn.mock.calls.length === 2) {
        abort.abort();
      }
    });

    await runWorker(
      {
        config: unreachable,
        taskQueue: "unused",
        workflows: { workflowBundle: { code: "" } },
      },
      { logger: log, signal: abort.signal, backoff: { initialMs: 5, maxMs: 10 } },
    );

    expect(log.warn).toHaveBeenCalledTimes(2);
    for (const [message] of log.warn.mock.calls) {
      expect(message).toContain("Temporal at 127.0.0.1:1 is unreachable");
      expect(message).not.toContain("secret-api-key");
    }
    expect(log.info).not.toHaveBeenCalled();
  }, 30_000);

  it("returns without connecting when already stopped", async () => {
    const log = logger();

    await runWorker(
      { config: unreachable, taskQueue: "unused", workflows: { workflowBundle: { code: "" } } },
      { logger: log, signal: AbortSignal.abort() },
    );

    expect(log.warn).not.toHaveBeenCalled();
  });

  it("creates a client without connecting", () => {
    expect(() => createWorkflowClient(unreachable)).not.toThrow();
  });

  it("sends the API key only when there is one", () => {
    expect(connectionOptions(unreachable)).toEqual({
      address: "127.0.0.1:1",
      tls: unreachable.tls,
      apiKey: "secret-api-key",
    });
    expect(connectionOptions({ ...unreachable, apiKey: undefined })).toEqual({
      address: "127.0.0.1:1",
      tls: unreachable.tls,
    });
  });
});
