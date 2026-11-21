import type { OrganizationService, Workspace } from "@merit/organizations/api";

export type WorkspaceOperations = Pick<OrganizationService, "workspacesPage" | "membersPage"> & {
  workspaceHomeUrl: (workspace: Workspace) => string;
};
