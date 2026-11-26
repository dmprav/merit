import type { ApplicationsService } from "@merit/applications/api";
import type { ContactOperations } from "@merit/contacts-ai";
import type { DecisionsService } from "@merit/decisions/api";
import type { GrantmakingOperations } from "@merit/grantmaking-ai";
import type { WorkspaceOperations } from "@merit/organizations-ai";
import type { DemoOperations } from "@merit/organizations-ai/demo";
import type { RecommendationsService } from "@merit/recommendations/api";
import type { ReviewerService, ReviewService } from "@merit/reviews/api";
import type { RoundsService } from "@merit/rounds/api";

export type McpOperations = {
  rounds: RoundsService;
  applications: ApplicationsService;
  reviews: ReviewService;
  reviewer: ReviewerService;
  recommendations: RecommendationsService;
  decisions: DecisionsService;
  grantmaking: GrantmakingOperations;
  contacts: ContactOperations;
  organizations: WorkspaceOperations;
  demo: DemoOperations;
};
