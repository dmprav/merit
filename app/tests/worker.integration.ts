import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, expect, it } from "vite-plus/test";

import { encryptedEncoding } from "@merit/workflows";
import {
  createClientWithPayloadKey,
  readStoredPayloads,
  readTestTemporalConfig,
  startTestWorker,
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

let worker: TestWorker;

beforeAll(async () => {
  worker = await startTestWorker(config, { workflows: { workflowsPath }, activities });
}, 30_000);

afterAll(async () => {
  await worker.stop();
});

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
  const withoutCodec = createClientWithPayloadKey(config, undefined);
  const withWrongKey = createClientWithPayloadKey(config, new Uint8Array(32).fill(9));

  await expect(withoutCodec.workflow.getHandle(workflowId).result()).rejects.toThrow();
  await expect(withWrongKey.workflow.getHandle(workflowId).result()).rejects.toThrow();
  await expect(worker.client.workflow.getHandle(workflowId).result()).resolves.toEqual({
    probeId,
    status: "ok",
  });
});
