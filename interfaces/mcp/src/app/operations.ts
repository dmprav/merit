import type { NavigationService } from "@merit/grantmaking/api";
import type { ReviewerService } from "@merit/reviews/api";

import type { ContactOperations } from "../features/contacts/operations";
import type { DemoOperations } from "../features/demo/operations";
import type { FundingRoundOperations } from "../features/grantmaking/operations";
import type { OrganizationOperations } from "../features/organizations/operations";
import type { TeamOperations } from "../features/team/operations";
import type { WorkspaceOperations } from "../features/workspace/operations";

export type McpOperations = {
  reviewer: ReviewerService;
  navigation: NavigationService;
  organizations: OrganizationOperations;
  demo: DemoOperations;
  workspace: FundingRoundOperations & ContactOperations;
  team: TeamOperations & WorkspaceOperations;
};
