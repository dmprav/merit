import { useEffect, useRef, useState } from "react";

type RefreshContext = "saved" | "read";

/** Quiet retries before a failed read is reported, as delays after each failure. */
const retryDelays = [1000, 3000];

/**
 * Refresh failures are separate from the write outcome; retrying only repeats the read. A failed
 * read retries in the background before it is reported, and refreshing covers only the first
 * attempt, so work stays available meanwhile. Once a failure is reported, the next refresh is the
 * person's explicit retry and reports its own failure at once.
 */
export const useWorkflowRefresh = (read: (context: RefreshContext) => Promise<unknown>) => {
  const [refreshError, setRefreshError] = useState<RefreshContext | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reported = useRef(false);
  const generation = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Quiet retries run after later renders, so they use the newest read operation.
  const latestRead = useRef(read);

  useEffect(() => {
    latestRead.current = read;
  });

  const cancelRefresh = () => {
    generation.current += 1;
    if (retry.current) {
      clearTimeout(retry.current);
      retry.current = null;
    }
  };

  useEffect(() => cancelRefresh, []);

  const report = (context: RefreshContext | null) => {
    reported.current = context !== null;
    setRefreshError(context);
  };

  const refresh = async (context: RefreshContext) => {
    cancelRefresh();
    const current = generation.current;
    const explicit = reported.current;
    report(null);
    setRefreshing(true);

    const attempt = async (operation: typeof read, retries: number) => {
      try {
        await operation(context);
      } catch {
        if (generation.current !== current) {
          return;
        }
        const delay = retryDelays[retries];
        if (explicit || delay === undefined) {
          report(context);
        } else {
          retry.current = setTimeout(() => {
            retry.current = null;
            void attempt(latestRead.current, retries + 1);
          }, delay);
        }
      }
    };

    await attempt(read, 0);
    if (generation.current === current) {
      setRefreshing(false);
    }
  };

  return { refresh, refreshError, refreshing };
};
