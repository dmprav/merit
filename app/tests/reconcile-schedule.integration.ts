import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, expect, it } from "vite-plus/test";

import { ensureSchedule } from "@merit/workflows";
import { readTestTemporalConfig, startTestWorker, type TestWorker } from "@merit/workflows/testing";

import { reconcileScheduleId } from "../src/worker/reconcile.workflow";

// Runs against the Compose Temporal service: `docker compose up -d --wait`.
const config = readTestTemporalConfig(process.env);
const workflowsPath = fileURLToPath(
  new URL("../src/worker/workflows.workflow.ts", import.meta.url),
);

let worker: TestWorker;
const scheduleId = `${reconcileScheduleId}-test-${crypto.randomUUID()}`;

beforeAll(async () => {
  worker = await startTestWorker(config, { workflows: { workflowsPath } });
}, 120_000);

afterAll(async () => {
  await worker.client.schedule.getHandle(scheduleId).delete();
  await worker.stop();
});

const settings = () => ({
  scheduleId,
  workflowType: "reconcile",
  taskQueue: worker.taskQueue,
  everyMs: 60_000,
  workflowId: scheduleId,
});

it("ensures exactly one reconciliation Schedule however often it is called", async () => {
  await ensureSchedule(worker.client, settings());
  await ensureSchedule(worker.client, settings());
  await Promise.all([
    ensureSchedule(worker.client, settings()),
    ensureSchedule(worker.client, settings()),
  ]);

  const matching = [];
  for await (const summary of worker.client.schedule.list()) {
    if (summary.scheduleId === scheduleId) {
      matching.push(summary);
    }
  }
  expect(matching).toHaveLength(1);
  const description = await worker.client.schedule.getHandle(scheduleId).describe();
  expect(description.spec.intervals).toMatchObject([{ every: 60_000 }]);
  expect(description.policies.overlap).toBe("SKIP");
});

it("updates an existing Schedule in place and keeps it paused when it was", async () => {
  const handle = worker.client.schedule.getHandle(scheduleId);
  await handle.pause("maintenance");

  await ensureSchedule(worker.client, { ...settings(), everyMs: 120_000 });

  const description = await handle.describe();
  expect(description.spec.intervals).toMatchObject([{ every: 120_000 }]);
  expect(description.state.paused).toBe(true);
  await handle.unpause();
});

it("runs the reconcile workflow on its Schedule", async () => {
  const handle = worker.client.schedule.getHandle(scheduleId);

  await handle.trigger();

  await expect
    .poll(async () => (await handle.describe()).info.recentActions.length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [recent] = (await handle.describe()).info.recentActions;
  const started = recent?.action;
  expect(started?.type).toBe("startWorkflow");
  const outcome: unknown = await worker.client.workflow
    .getHandle(started?.type === "startWorkflow" ? started.workflow.workflowId : "")
    .result();
  expect(outcome).toEqual({});
});
