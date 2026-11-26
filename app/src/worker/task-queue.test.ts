import { expect, it } from "vite-plus/test";

import { readWorkSettings } from "./task-queue";

it("uses the shared names unless the environment names others", () => {
  expect(readWorkSettings({})).toEqual({
    taskQueue: "merit",
    turnTaskQueue: "merit-assistant-turns",
    reconcileScheduleId: "merit-reconcile",
  });
  expect(
    readWorkSettings({
      MERIT_TASK_QUEUE: "merit-run",
      MERIT_TURN_TASK_QUEUE: "merit-run-turns",
      MERIT_RECONCILE_SCHEDULE_ID: "merit-run-reconcile",
    }),
  ).toEqual({
    taskQueue: "merit-run",
    turnTaskQueue: "merit-run-turns",
    reconcileScheduleId: "merit-run-reconcile",
  });
  expect(readWorkSettings({ MERIT_TASK_QUEUE: "" }).taskQueue).toBe("merit");
});
