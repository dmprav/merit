import type { WorkspaceSearchData, WorkspaceSearchTransport } from "../../contracts/search";

/**
 * Binds a workspace's search transport for use by the search controller.
 */
export const createWorkspaceSearchData = (source: WorkspaceSearchTransport): WorkspaceSearchData =>
  source;
