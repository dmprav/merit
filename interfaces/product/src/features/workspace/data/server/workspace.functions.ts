import { createServerFn } from "@tanstack/react-start";

import { workspaceSlugSchema } from "@merit/organizations/api";

import { loadWorkspace } from "./workspace.server";

export const readWorkspace = createServerFn({ method: "GET" })
  .validator(workspaceSlugSchema.optional())
  .handler(async ({ context, data }) => {
    return loadWorkspace(
      {
        readWorkspace: context.organizations.readWorkspace,
        currentIdentity: context.currentIdentity,
      },
      data,
    );
  });
