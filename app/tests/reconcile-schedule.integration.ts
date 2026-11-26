import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, expect, it } from "vite-plus/test";

import { ensureSchedule } from "@merit/workflows";
import { readTestTemporalConfig, startTestWorker, type TestWorker } from "@merit/workflows/testing";

import { reconcileScheduleId } from "../src/worker/task-queue";

// Runs against the Compose Temporal service: `docker compose up -d --wait`.
const config = readTestTemporalConfig(process.env);
const workflowsPath = fileURLToPath(
  new URL("../src/worker/workflows.workflow.ts", import.meta.url),
);

let worker: TestWorker;
let reconciled = 0;
// Each test creates its own Schedule, so a test runs alone; cleanup deletes every one.
const created: string[] = [];

beforeAll(async () => {
  worker = await startTestWorker(config, {
    workflows: { workflowsPath },
    activities: {
      reconcileReviewerMessages: async () => {
        reconciled += 1;
        return { listed: 0, started: 0 };
      },
      reconcileConversations: async () => ({ listed: 0, started: 0 }),
    },
  });
}, 120_000);

afterAll(async () => {
  for (const scheduleId of created) {
    await worker.client.schedule
      .getHandle(scheduleId)
      .delete()
      .catch(() => undefined);
  }
  await worker.stop();
});

/** Settings of a Schedule no other test uses; the Schedule is deleted after the run. */
const freshSettings = () => {
  const scheduleId = `${reconcileScheduleId}-test-${crypto.randomUUID()}`;
  created.push(scheduleId);
  return {
    scheduleId,
    workflowType: "reconcile",
    taskQueue: worker.taskQueue,
    everyMs: 60_000,
    workflowId: scheduleId,
  };
};

it("ensures exactly one reconciliation Schedule however often it is called", async () => {
  const settings = freshSettings();
  await ensureSchedule(worker.client, settings);
  await ensureSchedule(worker.client, settings);
  await Promise.all([
    ensureSchedule(worker.client, settings),
    ensureSchedule(worker.client, settings),
  ]);

  // The listing is eventually consistent, so wait for it to show the Schedule exactly once.
  await expect
    .poll(
      async () => {
        let count = 0;
        for await (const summary of worker.client.schedule.list()) {
          count += summary.scheduleId === settings.scheduleId ? 1 : 0;
        }
        return count;
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  const description = await worker.client.schedule.getHandle(settings.scheduleId).describe();
  expect(description.spec.intervals).toMatchObject([{ every: 60_000 }]);
  expect(description.policies.overlap).toBe("SKIP");
});

it("updates an existing Schedule in place and keeps it paused when it was", async () => {
  const settings = freshSettings();
  await ensureSchedule(worker.client, settings);
  const handle = worker.client.schedule.getHandle(settings.scheduleId);
  await handle.pause("maintenance");

  await ensureSchedule(worker.client, { ...settings, everyMs: 120_000 });

  const description = await handle.describe();
  expect(description.spec.intervals).toMatchObject([{ every: 120_000 }]);
  expect(description.state.paused).toBe(true);
});

it("runs the reconcile workflow on its Schedule", async () => {
  const settings = freshSettings();
  await ensureSchedule(worker.client, settings);
  const before = reconciled;

  await worker.client.schedule.getHandle(settings.scheduleId).trigger();

  await expect.poll(() => reconciled, { timeout: 15_000 }).toBeGreaterThan(before);
});
