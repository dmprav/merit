import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import { cursorPage } from "@merit/ai/contracts";
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
        "Find workspace members when choosing a responsible manager or a reviewer. Pass nextPage to this tool. A round manager must be an active program manager.",
      inputSchema: teamPageInput,
      outputSchema: memberPageSchema,
      errorSchema: z.object({ status: organizationProblemSchema }),
    },
    async (input) => {
      const result = await team.membersPage(actor, input);
      return result.status === "ok"
        ? { status: "ok" as const, ...cursorPage(input, result.value) }
        : result;
    },
  ),
  defineActorTool(
    actor,
    "list_workspaces",
    {
      description:
        "List the caller's workspaces and permissions for a requested lookup or action in Merit. For writing tasks (for example, wording for an invitation), respond directly using the details in the conversation. Only look up additional facts when the user asks for them or needs them to answer the question. When a workspace lookup is needed, use the returned slug and pass nextPage to this tool for more results.",
      inputSchema: workspacePageInput,
      outputSchema: workspaceListSchema,
      errorSchema: z.never(),
    },
    async (input) => {
      return presentWorkspaces(
        input,
        await team.workspacesPage(actor, input),
        team.workspaceHomeUrl,
      );
    },
  ),
];

export type { WorkspaceOperations } from "./operations";
