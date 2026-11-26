export type OutcomeWait = {
  /** How long a request waits for the first outcome. */
  timeoutMs: number;
  /** Pause between reads. */
  intervalMs: number;
};

/** A request waits about five seconds for the first outcome of the work it started. */
export const defaultOutcomeWait: OutcomeWait = { timeoutMs: 5000, intervalMs: 100 };

const expired = Symbol("expired");

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One read, held to the time left. With none left (a wait of zero) the read still runs once and
 * is awaited, because a caller that asked not to wait still wants what is there. A read that
 * ends after the deadline cannot fail the caller, so its rejection is dropped.
 */
const readWithin = async <T>(read: () => Promise<T>, remainingMs: number) => {
  const pending = read();
  if (remainingMs <= 0) {
    return pending;
  }
  pending.catch(() => undefined);
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<typeof expired>((resolve) => {
    timer = setTimeout(() => resolve(expired), remainingMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Poll Postgres, not Temporal, for the first outcome of work a request started. `read`
 * returns `undefined` while the work is unfinished. The wait is bounded, reads included: when
 * the time is up, even in the middle of a slow or stuck read, the result is `undefined` and the
 * caller reports what it finds, such as `pending`.
 */
export const waitForOutcome = async <T>(
  read: () => Promise<T | undefined>,
  { timeoutMs, intervalMs }: OutcomeWait = defaultOutcomeWait,
): Promise<T | undefined> => {
  const deadline = Date.now() + timeoutMs;
  // The one read a caller that asked not to wait still gets; every later read needs time left.
  let value = await readWithin(read, timeoutMs);
  for (;;) {
    if (value !== undefined && value !== expired) {
      return value;
    }
    if (value === expired || deadline - Date.now() <= 0) {
      return undefined;
    }
    await pause(Math.min(intervalMs, deadline - Date.now()));
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    value = await readWithin(read, remaining);
  }
};
