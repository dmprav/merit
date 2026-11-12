import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { workspaceActivityInput } from "@merit/grantmaking/api";

import { loadWorkspaceActivity } from "./funding-round.server";

// A POST keeps the selected person and cursor in the request body, out of URLs and logs.
export const readWorkspaceActivity = createServerFn({ method: "POST" })
  .validator(workspaceActivityInput)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return loadWorkspaceActivity(data, context.workspace);
  });
