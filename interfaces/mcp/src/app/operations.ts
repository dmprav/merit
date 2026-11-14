import type { ApplicationsService } from "@merit/applications/api";
import type { NavigationService } from "@merit/grantmaking/api";
import type { RecommendationsService } from "@merit/recommendations/api";
import type { ReviewerService, ReviewService } from "@merit/reviews/api";
import type { RoundsService } from "@merit/rounds/api";

import type {
  ContactApplicationOperations,
  ContactOperations,
} from "../features/contacts/operations";
import type { DemoOperations } from "../features/demo/operations";
import type { GrantmakingOperations } from "../features/grantmaking/operations";
import type { OrganizationOperations } from "../features/organizations/operations";
import type { TeamOperations } from "../features/team/operations";
import type { WorkspaceOperations } from "../features/workspace/operations";

export type McpOperations = {
  rounds: RoundsService;
  applications: ApplicationsService;
  reviews: ReviewService;
  reviewer: ReviewerService;
  recommendations: RecommendationsService;
  grantmaking: GrantmakingOperations & ContactApplicationOperations;
  contacts: ContactOperations;
  organizations: OrganizationOperations & TeamOperations & WorkspaceOperations;
  navigation: NavigationService;
  demo: DemoOperations;
};
