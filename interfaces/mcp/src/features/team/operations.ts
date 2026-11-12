import type { OrganizationService } from "@merit/organizations/api";

export type TeamOperations = Pick<
  OrganizationService,
  | "teamOverview"
  | "membersPage"
  | "invitationsPage"
  | "teamHistoryPage"
  | "teamEvent"
  | "inviteMember"
  | "resendMemberInvitation"
  | "revokeMemberInvitation"
  | "changeMember"
  | "removeMember"
>;
