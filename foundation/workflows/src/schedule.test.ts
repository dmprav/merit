import { ScheduleAlreadyRunning } from "@temporalio/client";
import { describe, expect, it, vi } from "vite-plus/test";

import { ensureSchedule } from "./schedule.ts";

const settings = {
  scheduleId: "merit-reconcile",
  workflowType: "reconcile",
  taskQueue: "merit",
  everyMs: 60_000,
  workflowId: "merit-reconcile",
};

const setup = (paused = true) => {
  const update = vi.fn(
    async (change: (previous: { state: { paused: boolean } }) => unknown) =>
      void change({ state: { paused } }),
  );
  const schedule = { create: vi.fn(), getHandle: vi.fn(() => ({ update })) };
  return { schedule, update, client: { schedule } as never };
};

describe("ensuring a Schedule", () => {
  it("creates it with an interval, the workflow and no overlapping runs", async () => {
    const { schedule, client } = setup();

    expect(await ensureSchedule(client, settings)).toBe(true);

    expect(schedule.create).toHaveBeenCalledExactlyOnceWith({
      scheduleId: "merit-reconcile",
      spec: { intervals: [{ every: 60_000 }] },
      action: {
        type: "startWorkflow",
        workflowType: "reconcile",
        taskQueue: "merit",
        workflowId: "merit-reconcile",
        args: [],
      },
      policies: { overlap: "SKIP" },
    });
    expect(schedule.getHandle).not.toHaveBeenCalled();
  });

  it("updates an existing Schedule in place and keeps its paused state", async () => {
    const { schedule, update, client } = setup();
    schedule.create.mockRejectedValue(new ScheduleAlreadyRunning("exists", "merit-reconcile"));

    expect(await ensureSchedule(client, { ...settings, everyMs: 120_000 })).toBe(false);

    expect(schedule.getHandle).toHaveBeenCalledWith("merit-reconcile");
    expect(update).toHaveBeenCalledOnce();
    const change = update.mock.calls[0]?.[0];
    expect(change?.({ state: { paused: true } })).toMatchObject({
      spec: { intervals: [{ every: 120_000 }] },
      state: { paused: true },
    });
  });

  it("enables startup recovery when an existing schedule is active", async () => {
    const { schedule, client } = setup(false);
    schedule.create.mockRejectedValue(new ScheduleAlreadyRunning("exists", "merit-reconcile"));
    expect(await ensureSchedule(client, settings)).toBe(true);
  });

  it("does not hide other failures", async () => {
    const { schedule, client } = setup();
    schedule.create.mockRejectedValue(new Error("unavailable"));

    await expect(ensureSchedule(client, settings)).rejects.toThrow("unavailable");
  });
});
