import { withActor } from "@merit/auth/request";

import type { WorkspaceServices } from "../../../../shared/request-context";

export const loadWorkspace = (
  services: Pick<WorkspaceServices, "currentIdentity" | "readWorkspace">,
  workspaceSlug?: string,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const workspace = await services.readWorkspace(actor, workspaceSlug);
    if (!workspace) {
      return { status: workspaceSlug ? "workspace_not_found" : "no_workspace" } as const;
    }
    return { status: "ok", workspace } as const;
  });
