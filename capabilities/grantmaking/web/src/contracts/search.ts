import type { WorkspaceSearch } from "@merit/grantmaking/api";

/** The search operation a workspace supplies. */
export type WorkspaceSearchData = WorkspaceSearchTransport;

/** How a workspace's search reaches the server. */
export type WorkspaceSearchTransport = {
  /** The workspace's private query scope, so an account change clears the results with it. */
  scope: readonly unknown[];
  /** Rejects when search is unavailable. Stop the request when the signal aborts. */
  read: (query: string, signal: AbortSignal) => Promise<WorkspaceSearch>;
};
