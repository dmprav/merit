import type { AssistantDependency } from "./contracts";
import type { AssistantContext, AssistantWorkspace } from "./operations";

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
