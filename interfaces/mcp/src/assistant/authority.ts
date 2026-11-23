import type { WorkspaceToolName } from "../app/tools";
import type { AssistantDependency } from "./contracts";
import type { AssistantContext, AssistantWorkspace } from "./operations";

export const requiredAccess = (
  name: WorkspaceToolName,
): Exclude<AssistantDependency["kind"], "assignment"> => {
  switch (name) {
    case "list_workspaces":
      return "membership";
    case "list_team_members":
      return "team";
    case "list_my_reviews":
    case "get_reviewer_assignment":
    case "save_reviewer_draft":
    case "submit_reviewer_assessment":
    case "respond_to_review":
      return "reviewer";
    default:
      return "grants";
  }
};

export const workspacePermits = (
  workspace: AssistantWorkspace,
  kind: AssistantDependency["kind"],
) => {
  switch (kind) {
    case "membership":
      return true;
    case "grants":
      return workspace.canWorkOnGrants;
    case "team":
      return workspace.canViewTeam;
    case "assignment":
    case "reviewer":
      return workspace.role === "reviewer" || workspace.role === "program_manager";
  }
};

export const activeAssignment = (status: unknown) =>
  status === "invited" || status === "accepted" || status === "submitted";

export const permitsAll = async (
  { ops, workspaceSlug, actor }: AssistantContext,
  dependencies: AssistantDependency[],
) => {
  const workspace = await ops.readWorkspace(actor, workspaceSlug);
  if (!workspace || workspace.slug !== workspaceSlug) {
    return false;
  }
  for (const dependency of dependencies) {
    if (!workspacePermits(workspace, dependency.kind)) {
      return false;
    }
    if (dependency.kind === "assignment") {
      const read = await ops.reviewer.read(actor, {
        workspaceSlug,
        assignmentId: dependency.assignmentId,
      });
      if (
        read.status !== "ok" ||
        read.value.assignment.workspaceSlug !== workspaceSlug ||
        (dependency.active && !activeAssignment(read.value.assignment.status)) ||
        (dependency.evidence && read.value.material === null)
      ) {
        return false;
      }
    }
  }
  return true;
};
