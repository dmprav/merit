/** The task queue the application worker polls and application code starts workflows on. */
export const taskQueue = "merit";

/**
 * The queue of Merit AI turn activities. The worker polls it with its own concurrency limit, so
 * model calls never take the slots that email delivery needs.
 */
export const assistantTurnTaskQueue = "merit-assistant-turns";

/** The most Merit AI turns one worker process runs at once. */
export const assistantTurnConcurrency = 4;
