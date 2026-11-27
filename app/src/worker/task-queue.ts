/** The task queue the application worker polls and application code starts workflows on. */
export const taskQueue = "merit";

/**
 * The queue of Merit AI turn activities. The worker polls it with its own concurrency limit, so
 * model calls never take the slots that email delivery needs.
 */
export const assistantTurnTaskQueue = "merit-assistant-turns";

/** The Schedule that starts reconciliation. */
export const reconcileScheduleId = "merit-reconcile";

/** The most Merit AI turns one worker process runs at once. */
export const assistantTurnConcurrency = 4;

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The queues and Schedule a web server and its worker share. The defaults are the names above;
 * a run that shares a Temporal server with another, such as the browser tests beside a
 * developer's own worker, sets its own so the two never take each other's work.
 */
export const readWorkSettings = (env: Environment) => ({
  taskQueue: env.MERIT_TASK_QUEUE || taskQueue,
  turnTaskQueue: env.MERIT_TURN_TASK_QUEUE || assistantTurnTaskQueue,
  reconcileScheduleId: env.MERIT_RECONCILE_SCHEDULE_ID || reconcileScheduleId,
});

/** How often the worker schedules recovery of committed work that missed its Temporal handoff. */
export const readReconcileIntervalMs = (env: Environment) => {
  const seconds = env.MERIT_RECONCILE_INTERVAL_SECONDS?.trim() ?? "3600";
  const intervalMs = Number(seconds) * 1000;
  if (!/^\d+$/u.test(seconds) || !Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new Error("MERIT_RECONCILE_INTERVAL_SECONDS must be a positive whole number of seconds.");
  }
  return intervalMs;
};
