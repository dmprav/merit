import type { OrganizationService, Workspace } from "@merit/organizations/api";

export type WorkspaceOperations = Pick<OrganizationService, "workspacesPage" | "membersPage"> & {
  workspaceHomeUrl: (
    workspace: Pick<Workspace, "slug" | "canWorkOnGrants" | "canViewTeam">,
  ) => string;
};
