import { McpServer } from "@modelcontextprotocol/server";

import { createToolRegistrar } from "../components/register-tool";
import type { McpActor } from "../contracts";
import { registerApplicationTools } from "../features/applications/tools";
import { registerContactTools } from "../features/contacts/tools";
import { registerDemoTools } from "../features/demo/tools";
import { registerGrantmakingTools } from "../features/grantmaking/tools";
import { registerNavigationTools } from "../features/navigation/tools";
import {
  registerOrganizationTools,
  registerOnboardingTools,
} from "../features/organizations/tools";
import { registerRecommendationTools } from "../features/recommendations/tools";
import { registerReviewTools } from "../features/reviews/tools";
import { registerRoundTools } from "../features/rounds/tools";
import { registerTeamTools } from "../features/team/tools";
import { registerWorkspaceTools } from "../features/workspace/tools";
import type { McpOperations } from "./operations";

export const createWorkspaceServer = (
  actor: McpActor,
  {
    rounds,
    applications,
    reviews,
    reviewer,
    recommendations,
    grantmaking,
    contacts,
    organizations,
    navigation,
    demo,
  }: McpOperations,
  origin: string,
) => {
  const server = new McpServer({ name: "merit-workspace", version: "1.0.0" });
  const register = createToolRegistrar(server, actor);
  registerWorkspaceTools(register, actor, organizations, origin);
  registerGrantmakingTools(register, actor, grantmaking, origin);
  registerRoundTools(register, actor, rounds);
  registerApplicationTools(register, actor, applications);
  registerReviewTools(register, actor, reviews, reviewer);
  registerRecommendationTools(register, actor, recommendations);
  registerContactTools(register, actor, contacts, grantmaking);
  registerTeamTools(register, actor, organizations);
  registerNavigationTools(register, actor, navigation);
  registerOrganizationTools(register, actor, organizations);
  registerOnboardingTools(register, actor, organizations);
  registerDemoTools(register, actor, demo);
  return server;
};
