import { createServerFn } from "@tanstack/react-start";

import { workspaceActivityInput } from "@merit/grantmaking/api";

import { loadWorkspaceActivity } from "./funding-round.server";

// A POST keeps the selected person and cursor in the request body, out of URLs and logs.
export const readWorkspaceActivity = createServerFn({ method: "POST" })
  .validator(workspaceActivityInput)
  .handler(async ({ data, context }) => {
    return loadWorkspaceActivity(data, {
      listWorkspaceActivity: context.grantmaking.listWorkspaceActivity,
      currentIdentity: context.currentIdentity,
    });
  });
