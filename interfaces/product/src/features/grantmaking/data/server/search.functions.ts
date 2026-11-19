import { createServerFn } from "@tanstack/react-start";

import { workspaceSearchInput } from "@merit/grantmaking/api";

import { loadWorkspaceSearch } from "./funding-round.server";

// A POST keeps the typed query in the request body, out of URLs, history, and request logs.
export const searchWorkspace = createServerFn({ method: "POST" })
  .validator(workspaceSearchInput)
  .handler(async ({ data, context }) => {
    return loadWorkspaceSearch(data, {
      searchWorkspace: context.grantmaking.searchWorkspace,
      currentIdentity: context.currentIdentity,
    });
  });
