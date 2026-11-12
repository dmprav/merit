import { z } from "zod";

import { workspacePageInput } from "@merit/organizations/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { WorkspaceOperations } from "./operations";
import { workspaceListSchema, presentWorkspaces } from "./responses";

export const registerWorkspaceTools = (
  register: RegisterTool,
  actor: McpActor,
  team: WorkspaceOperations,
  origin: string,
) => {
  register(
    "list_workspaces",
    {
      description:
        "Discover your current workspaces and grant/team permissions. Start here; never guess workspace identifiers. Follow nextCursor as after to list all workspaces in stable ID order.",
      inputSchema: workspacePageInput,
      outputSchema: workspaceListSchema,
      errorSchema: z.never(),
      scope: "workspace:read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      return presentWorkspaces(await team.workspacesPage(actor, input), actor, origin);
    },
  );
};
