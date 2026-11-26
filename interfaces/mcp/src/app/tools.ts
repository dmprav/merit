import { z } from "zod";

import type { defineActorTool } from "@merit/ai";
import { createApplicationTools } from "@merit/applications-ai";
import type { Actor } from "@merit/auth";
import { createContactTools } from "@merit/contacts-ai";
import { createDecisionTools } from "@merit/decisions-ai";
import { createGrantmakingTools } from "@merit/grantmaking-ai";
import { createWorkspaceTools } from "@merit/organizations-ai";
import { createDemoTools } from "@merit/organizations-ai/demo";
import { createRecommendationTools } from "@merit/recommendations-ai";
import { createReviewerTools } from "@merit/reviews-ai";
import { createManagerTools } from "@merit/reviews-ai/manager";
import { createRoundTools } from "@merit/rounds-ai";

import type { McpActor } from "../contracts";
import type { McpOperations } from "./operations";
import { publication } from "./publication";

export const workspaceCatalog = (
  actor: Actor,
  ops: Omit<McpOperations, "demo">,
  origin: string,
) => [
  ...createWorkspaceTools(actor, ops.organizations),
  ...createGrantmakingTools(actor, ops.grantmaking, origin),
  ...createRoundTools(actor, ops.rounds),
  ...createApplicationTools(actor, ops.applications),
  ...createManagerTools(actor, ops.reviews, ops.reviewer),
  ...createReviewerTools(actor, ops.reviewer),
  ...createRecommendationTools(actor, ops.recommendations),
  ...createDecisionTools(actor, ops.decisions),
  ...createContactTools(actor, ops.contacts),
];

export type WorkspaceToolName = ReturnType<typeof workspaceCatalog>[number]["name"] | "start_demo";

type WorkspaceListing = Extract<
  ReturnType<typeof workspaceCatalog>[number],
  { name: "list_workspaces" }
>;

const withClientScopes = (tool: WorkspaceListing, scopes: readonly string[]) => {
  const successSchema = tool.successSchema.extend({
    grantedScopes: z.array(z.string()).optional(),
  });

  const execute = async (input: unknown) => {
    const result = await tool.execute(input);
    return result.status === "ok" ? { ...result, grantedScopes: [...scopes] } : result;
  };

  return {
    ...tool,
    successSchema,
    outputSchema: z.union([
      successSchema,
      tool.outputSchema.refine((result) => result.status !== "ok"),
    ]),
    execute,
  };
};

export const createMcpCatalog = (actor: McpActor, ops: McpOperations, origin: string) =>
  [
    ...workspaceCatalog(actor, ops, origin),
    ...createDemoTools(actor, ops.demo, ops.organizations.workspaceHomeUrl),
  ].map((definition) => {
    const { scope, annotations } = publication[definition.name];
    const tool: ReturnType<typeof defineActorTool> =
      definition.name === "list_workspaces"
        ? withClientScopes(definition, actor.scopes)
        : definition;
    return { ...tool, scope, metadata: { annotations } };
  });
