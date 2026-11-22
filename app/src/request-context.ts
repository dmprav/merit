import type { ApplicationsService } from "@merit/applications/api";
import type { Identity } from "@merit/auth";
import type { ContactService } from "@merit/contacts/api";
import type { GrantmakingQueries, NavigationService } from "@merit/grantmaking/api";
import type { OrganizationService } from "@merit/organizations/api";
import type { DemoServices } from "@merit/product/context";
import type { RecommendationsService } from "@merit/recommendations/api";
import type { ReviewerService, ReviewService } from "@merit/reviews/api";
import type { RoundsService } from "@merit/rounds/api";

export interface ApplicationRequestContext {
  navigation: NavigationService;
  reviewer: ReviewerService;
  demo: DemoServices;
  secureCookies: boolean;
  currentIdentity: () => Promise<Identity>;
  rounds: RoundsService;
  applications: ApplicationsService;
  reviews: ReviewService;
  recommendations: RecommendationsService;
  contacts: ContactService;
  grantmaking: GrantmakingQueries;
  organizations: OrganizationService;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: ApplicationRequestContext };
  }
}
