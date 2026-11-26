import { errorMessage } from "../../cli.ts";

/** Registers a release and returns it, made idempotent, so its owner can also run it early. */
export type RegisterCleanup = (cleanup: () => Promise<void>) => () => Promise<void>;

export type Log = (line: string) => void;

/** What each resource a run starts needs: the repository, the run's log, and its cleanup stack. */
export type RunContext = {
  repoRoot: string;
  log: Log;
  registerCleanup: RegisterCleanup;
};

/** Starts a release at once, turning a throw before it returns a promise into a rejection. */
const startRelease = (cleanup: () => Promise<void>): Promise<void> => {
  try {
    return cleanup();
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * Releases resources in reverse registration order. A resource registered while the drain runs,
 * such as a server whose spawn was already under way, starts releasing at once, and the drain
 * waits for it before releasing anything older, so the output lock outlasts it and the process
 * never exits with that release unfinished. A failed release is logged and the drain continues
 * with the rest.
 */
export const createCleanupStack = (
  log: Log,
): {
  registerCleanup: RegisterCleanup;
  runCleanups: () => Promise<void>;
} => {
  const cleanups: Array<() => Promise<void>> = [];
  const lateCleanups: Array<Promise<void>> = [];
  let cleaningUp = false;
  let cleanupPromise: Promise<void> | undefined;

  const reportFailure = (error: unknown) => {
    log(`Cleanup failed: ${errorMessage(error)}`);
  };

  const registerCleanup: RegisterCleanup = (cleanup) => {
    let pending: Promise<void> | undefined;

    const idempotent = () => {
      pending ??= startRelease(cleanup);
      return pending;
    };

    if (cleaningUp) {
      lateCleanups.push(idempotent().catch(reportFailure));
    } else {
      cleanups.push(idempotent);
    }
    return idempotent;
  };

  // A late release is newer than every entry still on the stack, so it finishes first.
  const drain = async () => {
    while (cleanups.length > 0 || lateCleanups.length > 0) {
      const late = lateCleanups.shift();
      if (late) {
        await late;
      } else {
        await cleanups.pop()?.().catch(reportFailure);
      }
    }
  };

  const runCleanups = (): Promise<void> => {
    cleaningUp = true;
    cleanupPromise ??= drain();
    return cleanupPromise;
  };

  return { registerCleanup, runCleanups };
};

/**
 * Registers a resource's release before awaiting its acquisition, so a signal that drains the
 * cleanup stack mid-acquisition still waits for the resource and releases it. Rejects instead of
 * returning the resource when that shutdown began during acquisition.
 */
export const acquireWithCleanup = async <T>(
  acquisition: Promise<T>,
  release: (resource: T) => Promise<void>,
  registerCleanup: RegisterCleanup,
): Promise<{ resource: T; release: () => Promise<void> }> => {
  let releaseStarted = false;
  const releaseOnce = registerCleanup(async () => {
    releaseStarted = true;
    // A failed acquisition left nothing to release; its acquirer reports that failure.
    const acquired = await acquisition.then(
      (value) => ({ value }),
      () => undefined,
    );
    if (acquired) {
      await release(acquired.value);
    }
  });
  const resource = await acquisition;
  if (releaseStarted) {
    throw new Error("Cleanup started while the resource was being acquired.");
  }
  return { resource, release: releaseOnce };
};
