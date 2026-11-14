import type { WorkspaceSearch } from "@merit/grantmaking/api";

/** What one read of a settled query returns. Results from the previous query stay until the next arrive. */
export type WorkspaceSearchRead = {
  results: WorkspaceSearch | undefined;
  /** The query `results` answer, which is an earlier one while newer results load. */
  answered: string | undefined;
  failed: boolean;
  /** A request is in flight, so `results` may answer an earlier query. */
  fetching: boolean;
  /** Changes whenever results arrive, even when they repeat. */
  updatedAt: number;
  /** Repeats the failed read. */
  retry: () => void;
};

/** The search operation a workspace supplies: a hook that reads one settled query. */
export type WorkspaceSearchData = {
  /** Sends nothing for an empty query. */
  useResults: (query: string) => WorkspaceSearchRead;
};

/** How a workspace's search reaches the server. */
export type WorkspaceSearchTransport = {
  /** The workspace's private query scope, so an account change clears the results with it. */
  scope: readonly unknown[];
  /** Rejects when search is unavailable. Stop the request when the signal aborts. */
  read: (query: string, signal: AbortSignal) => Promise<WorkspaceSearch>;
};
