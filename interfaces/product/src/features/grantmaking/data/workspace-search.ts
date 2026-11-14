import { createWorkspaceSearchData } from "@merit/grantmaking-web/data/search";
import { available } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { searchWorkspace } from "./server/search.functions";

/** Binds one workspace's search to its POST server function, so typed text stays in the request body. */
export const workspaceSearchData = (workspaceSlug: string) =>
  createWorkspaceSearchData({
    scope: grantWorkQueryKey(workspaceSlug),
    read: async (query, signal) => {
      const result = available(await searchWorkspace({ signal, data: { workspaceSlug, query } }));
      // A workspace that is no longer reachable reads as unavailable; the box keeps the typed text.
      if (result.status !== "ok") {
        throw new Error("Search is unavailable");
      }
      return result;
    },
  });
