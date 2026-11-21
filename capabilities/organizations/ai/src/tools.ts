import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";
import {
  organizationProblemSchema,
  teamPageInput,
  workspacePageInput,
} from "@merit/organizations/api";

import type { WorkspaceOperations } from "./operations";
import { memberPageSchema, workspaceListSchema, presentWorkspaces } from "./responses";

export const createWorkspaceTools = (actor: Actor, team: WorkspaceOperations) => [
  defineActorTool(
    actor,
    "list_team_members",
    {
      description:
        "Find workspace members when choosing a responsible manager or a reviewer. Follow nextCursor as after. A round manager must be an active program manager.",
      inputSchema: teamPageInput,
      outputSchema: memberPageSchema,
      errorSchema: z.object({ status: organizationProblemSchema }),
    },
    async (input) => {
      const result = await team.membersPage(actor, input);
      return result.status === "ok" ? { status: "ok" as const, ...result.value } : result;
    },
  ),
  defineActorTool(
    actor,
    "list_workspaces",
    {
      description:
        "Discover your current workspaces and grant/team permissions. Start here; never guess workspace identifiers. Follow nextCursor as after to list all workspaces in stable ID order.",
      inputSchema: workspacePageInput,
      outputSchema: workspaceListSchema,
      errorSchema: z.never(),
    },
    async (input) => {
      return presentWorkspaces(await team.workspacesPage(actor, input), team.workspaceHomeUrl);
    },
  ),
];

export type { WorkspaceOperations } from "./operations";
