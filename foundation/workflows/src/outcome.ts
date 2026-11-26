import { setTimeout as delay } from "node:timers/promises";

export type OutcomeWait = {
  /** How long a request waits for the first outcome. */
  timeoutMs: number;
  /** Pause between reads. */
  intervalMs: number;
};

/** A request waits about five seconds for the first outcome of the work it started. */
export const defaultOutcomeWait: OutcomeWait = { timeoutMs: 5000, intervalMs: 100 };

/**
 * Poll Postgres, not Temporal, for the first outcome of work a request started. `read`
 * returns `undefined` while the work is unfinished. The wait is bounded: when it ends
 * the result is `undefined` and the caller reports what it finds, such as `pending`.
 */
export const waitForOutcome = async <T>(
  read: () => Promise<T | undefined>,
  { timeoutMs, intervalMs }: OutcomeWait = defaultOutcomeWait,
): Promise<T | undefined> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    await delay(Math.min(intervalMs, remaining));
  }
};
