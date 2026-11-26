import { expect, it } from "vite-plus/test";

import { readReconcileIntervalMs, readWorkSettings } from "./task-queue";

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

it("schedules hourly recovery by default and reads overrides in whole seconds", () => {
  expect(readReconcileIntervalMs({})).toBe(3_600_000);
  expect(readReconcileIntervalMs({ MERIT_RECONCILE_INTERVAL_SECONDS: "15" })).toBe(15_000);
});

it.each(["", "0", "-1", "0.5", "abc", "1e2", "9007199254740992"])(
  "rejects an invalid worker recovery interval (%j)",
  (seconds) => {
    expect(() => readReconcileIntervalMs({ MERIT_RECONCILE_INTERVAL_SECONDS: seconds })).toThrow(
      "MERIT_RECONCILE_INTERVAL_SECONDS must be a positive whole number of seconds.",
    );
  },
);
