import { McpServer } from "@modelcontextprotocol/server";

import { createToolRegistrar } from "../components/register-tool";
import type { McpActor } from "../contracts";
import { registerContactTools } from "../features/contacts/tools";
import { registerDemoTools } from "../features/demo/tools";
import { registerFundingRoundTools } from "../features/grantmaking/tools";
import { registerNavigationTools } from "../features/navigation/tools";
import {
  registerOrganizationTools,
  registerOnboardingTools,
} from "../features/organizations/tools";
import { registerReviewerTools } from "../features/reviewer/tools";
import { registerTeamTools } from "../features/team/tools";
import { registerWorkspaceTools } from "../features/workspace/tools";
import type { McpOperations } from "./operations";

export const createWorkspaceServer = (
  actor: McpActor,
  { workspace, team, reviewer, navigation, organizations, demo }: McpOperations,
  origin: string,
) => {
  const server = new McpServer({ name: "merit-workspace", version: "1.0.0" });
  const register = createToolRegistrar(server, actor);
  registerWorkspaceTools(register, actor, team, origin);
  registerFundingRoundTools(register, actor, workspace, origin);
  registerContactTools(register, actor, workspace);
  registerTeamTools(register, actor, team);
  registerReviewerTools(register, actor, reviewer);
  registerNavigationTools(register, actor, navigation);
  registerOrganizationTools(register, actor, organizations);
  registerOnboardingTools(register, actor, organizations);
  registerDemoTools(register, actor, demo);
  return server;
};
