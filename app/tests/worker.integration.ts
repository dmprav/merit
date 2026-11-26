import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, expect, it } from "vite-plus/test";

import { encryptedEncoding } from "@merit/workflows";
import {
  createClientWithPayloadKey,
  readStoredFailures,
  readStoredPayloads,
  readTestTemporalConfig,
  startTestWorker,
  storedHistoryIncludes,
  uniqueName,
  type TestWorker,
} from "@merit/workflows/testing";

import * as activities from "../src/worker/activities.ts";
import { workerHealth } from "../src/worker/health.workflow.ts";

// Runs against the Compose Temporal service: `docker compose up -d --wait`.
const config = readTestTemporalConfig(process.env);
const workflowsPath = fileURLToPath(
  new URL("../src/worker/workflows.workflow.ts", import.meta.url),
);

const failingWorkflowsPath = fileURLToPath(
  new URL("./fixtures/failing.workflow.ts", import.meta.url),
);

let worker: TestWorker;
let failingWorker: TestWorker;
const extraClients: ReturnType<typeof createClientWithPayloadKey>[] = [];

beforeAll(async () => {
  worker = await startTestWorker(config, { workflows: { workflowsPath }, activities });
  failingWorker = await startTestWorker(config, {
    workflows: { workflowsPath: failingWorkflowsPath },
    activities: {
      failWithMessage: async (message: string) => {
        throw new Error(message);
      },
    },
  });
}, 60_000);

afterAll(async () => {
  await worker.stop();
  await failingWorker.stop();
  await Promise.all(extraClients.map((client) => client.connection.close()));
});

const clientWithPayloadKey = (key: Uint8Array | undefined) => {
  const client = createClientWithPayloadKey(config, key);
  extraClients.push(client);
  return client;
};

const start = async () => {
  const workflowId = uniqueName("worker-health");
  const probeId = uniqueName("probe");
  const result = await worker.client.workflow.execute(workerHealth, {
    taskQueue: worker.taskQueue,
    workflowId,
    args: [{ probeId }],
    workflowExecutionTimeout: "30 seconds",
  });
  return { workflowId, probeId, result };
};

it("runs a workflow and its activity on the worker and returns the result", async () => {
  const { probeId, result } = await start();

  expect(result).toEqual({ probeId, status: "ok" });
});

it("stores only encrypted payloads in workflow history", async () => {
  const { workflowId, probeId } = await start();

  const payloads = await readStoredPayloads(worker.client, workflowId, config.namespace);

  // Workflow input and result, plus the activity's input and result.
  expect(payloads.length).toBeGreaterThanOrEqual(4);
  for (const payload of payloads) {
    expect(new TextDecoder().decode(payload.metadata?.encoding ?? new Uint8Array())).toBe(
      encryptedEncoding,
    );
    expect(Buffer.from(payload.data ?? new Uint8Array()).includes(probeId)).toBe(false);
  }
});

it("cannot read a result without the payload key", async () => {
  const { workflowId, probeId } = await start();
  const withoutCodec = clientWithPayloadKey(undefined);
  const withWrongKey = clientWithPayloadKey(new Uint8Array(32).fill(9));

  await expect(withoutCodec.workflow.getHandle(workflowId).result()).rejects.toThrow();
  await expect(withWrongKey.workflow.getHandle(workflowId).result()).rejects.toThrow();
  await expect(worker.client.workflow.getHandle(workflowId).result()).resolves.toEqual({
    probeId,
    status: "ok",
  });
});

it("stores failure messages and stack traces encrypted", async () => {
  const workflowId = uniqueName("worker-failure");
  const probe = `failure-probe-${uniqueName("text")}`;

  const outcome = await failingWorker.client.workflow
    .execute("failingProbe", {
      taskQueue: failingWorker.taskQueue,
      workflowId,
      args: [{ message: probe }],
      workflowExecutionTimeout: "30 seconds",
    })
    .then(
      () => undefined,
      (error: unknown) => error,
    );

  // The client decrypts the failure, so its caller still sees the message.
  expect(outcome).toBeInstanceOf(Error);
  expect(JSON.stringify(outcome, Object.getOwnPropertyNames(outcome))).toContain(probe);

  expect(
    await storedHistoryIncludes(failingWorker.client, workflowId, config.namespace, probe),
  ).toBe(false);
  const failures = await readStoredFailures(failingWorker.client, workflowId, config.namespace);
  expect(failures.length).toBeGreaterThan(0);
  for (const failure of failures) {
    expect(failure.message).toBe("Encoded failure");
    expect(new TextDecoder().decode(failure.encodedAttributes?.metadata?.encoding)).toBe(
      encryptedEncoding,
    );
  }
});
