import { useState } from "react";

type RefreshContext = "saved" | "read";

/** Refresh failures are separate from the write outcome; retrying only repeats the read. */
export const useWorkflowRefresh = (read: (context: RefreshContext) => Promise<unknown>) => {
  const [refreshError, setRefreshError] = useState<RefreshContext | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async (context: RefreshContext) => {
    setRefreshing(true);
    try {
      await read(context);
      setRefreshError(null);
    } catch {
      setRefreshError(context);
    }
    setRefreshing(false);
  };

  return { refresh, refreshError, refreshing };
};
