import type { Identity } from "@merit/auth";
import type { OrganizationService } from "@merit/organizations/api";

// Both app interfaces receive the same capability from the host.
export interface AdminRequestContext {
  currentIdentity: () => Promise<Identity>;
  organizations: OrganizationService;
}
