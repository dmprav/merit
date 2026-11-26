import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client";

import type { WorkflowClient } from "./connection.ts";

export type ScheduleSettings = {
  scheduleId: string;
  workflowType: string;
  taskQueue: string;
  /** Interval between runs, in milliseconds. */
  everyMs: number;
  /** Fixed ID of each run; the schedule appends the run's time. */
  workflowId: string;
  args?: unknown[];
};

const options = ({
  workflowType,
  taskQueue,
  everyMs,
  workflowId,
  args = [],
}: ScheduleSettings) => ({
  spec: { intervals: [{ every: everyMs }] },
  action: { type: "startWorkflow" as const, workflowType, taskQueue, workflowId, args },
  // A run still going when the next is due makes that one wait; runs never pile up.
  policies: { overlap: ScheduleOverlapPolicy.SKIP },
});

/**
 * Make one Schedule exist with these settings. Calling it again, from any number of workers,
 * creates nothing new: an existing Schedule is updated in place and keeps its paused state.
 */
export const ensureSchedule = async (client: WorkflowClient, settings: ScheduleSettings) => {
  const wanted = options(settings);
  try {
    await client.schedule.create({ scheduleId: settings.scheduleId, ...wanted });
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      throw error;
    }
    await client.schedule
      .getHandle(settings.scheduleId)
      .update((previous) => ({ ...wanted, state: previous.state }));
  }
};
