import type { OrganizationService } from "@merit/organizations/api";

export type OrganizationOperations = Pick<
  OrganizationService,
  | "list"
  | "read"
  | "create"
  | "rename"
  | "invite"
  | "revoke"
  | "invitation"
  | "accept"
  | "requestAccess"
  | "accessRequests"
  | "reviewAccessRequest"
>;
