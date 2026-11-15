import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { workspaceSearchInput } from "@merit/grantmaking/api";

import { loadWorkspaceSearch } from "./funding-round.server";

// A POST keeps the typed query in the request body, out of URLs, history, and request logs.
export const searchWorkspace = createServerFn({ method: "POST" })
  .validator(workspaceSearchInput)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return loadWorkspaceSearch(data, context.workspace);
  });
