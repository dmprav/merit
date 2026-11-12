import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { workspaceSlugSchema } from "@merit/organizations/api";

import { loadWorkspace } from "./workspace.server";

export const readWorkspace = createServerFn({ method: "GET" })
  .validator(workspaceSlugSchema.optional())
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return loadWorkspace(context.workspace, data);
  });
