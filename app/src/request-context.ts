import type { Identity } from "@merit/auth";
import type { NavigationService } from "@merit/grantmaking/api";
import type { OrganizationService } from "@merit/organizations/api";
import type { DemoServices, WorkspaceServices } from "@merit/product/context";
import type { ReviewerService } from "@merit/reviews/api";

export interface ApplicationRequestContext {
  navigation: NavigationService;
  reviewer: ReviewerService;
  demo: DemoServices;
  currentIdentity: () => Promise<Identity>;
  workspace: WorkspaceServices;
  organizations: OrganizationService;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: ApplicationRequestContext };
  }
}
