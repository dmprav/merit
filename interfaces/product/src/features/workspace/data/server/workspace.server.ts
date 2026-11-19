import type { Identity } from "@merit/auth";
import { withActor } from "@merit/auth/request";
import type { OrganizationService } from "@merit/organizations/api";

export const loadWorkspace = (
  services: Pick<OrganizationService, "readWorkspace"> & {
    currentIdentity: () => Promise<Identity>;
  },
  workspaceSlug?: string,
) =>
  withActor(services.currentIdentity, async (actor) => {
    const workspace = await services.readWorkspace(actor, workspaceSlug);
    if (!workspace) {
      return { status: workspaceSlug ? "workspace_not_found" : "no_workspace" } as const;
    }
    return { status: "ok", workspace } as const;
  });
