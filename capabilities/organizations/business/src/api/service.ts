import type { z } from "zod";

import type { Actor } from "@merit/auth";

import type {
  accessRequestInput,
  createOrganizationInput,
  renameOrganizationInput,
  replaceInvitationInput,
  inviteMemberInput,
  teamInvitationInput,
  memberInput,
  changeMemberInput,
  MemberChange,
  RequestAccessResult,
} from "./commands";
import type { organizationIdInput, invitationTokenInput, teamInput } from "./identifiers";
import type {
  workspacePageInput,
  teamPageInput,
  invitationPageInput,
  teamEventInput,
  OrganizationSummary,
  OrganizationDetails,
  InvitationDetails,
  Workspace,
  Team,
  TeamOverview,
  MemberPage,
  InvitationPage,
  TeamHistoryPage,
  TeamEventContent,
} from "./queries";
import type { Organization, AccessRequest } from "./records";
import type { Result } from "./result";

export interface OrganizationService {
  canAdminister: (actor: Actor) => boolean;
  requestAccess: (input: z.input<typeof accessRequestInput>) => Promise<RequestAccessResult>;
  accessRequests: (actor: Actor) => Promise<Result<AccessRequest[]>>;
  reviewAccessRequest: (
    actor: Actor,
    input: z.input<typeof accessRequestInput>,
  ) => Promise<Result<AccessRequest>>;
  list: (
    actor: Actor,
  ) => Promise<{ status: "forbidden" } | { status: "ok"; value: OrganizationSummary[] }>;
  read: (
    actor: Actor,
    input: z.input<typeof organizationIdInput>,
  ) => Promise<Result<OrganizationDetails>>;
  create: (
    actor: Actor,
    input: z.input<typeof createOrganizationInput>,
  ) => Promise<Result<{ organizationId: string }>>;
  rename: (actor: Actor, input: z.input<typeof renameOrganizationInput>) => Promise<Result<null>>;
  invite: (actor: Actor, input: z.input<typeof replaceInvitationInput>) => Promise<Result<null>>;
  revoke: (actor: Actor, input: z.input<typeof organizationIdInput>) => Promise<Result<null>>;
  invitation: (
    actor: Actor,
    input: z.input<typeof invitationTokenInput>,
  ) => Promise<Result<InvitationDetails>>;
  accept: (
    actor: Actor,
    input: z.input<typeof invitationTokenInput>,
  ) => Promise<Result<Organization & { canWorkOnGrants: boolean }>>;
  teamOverview: (actor: Actor, input: z.input<typeof teamInput>) => Promise<Result<TeamOverview>>;
  membersPage: (actor: Actor, input: z.input<typeof teamPageInput>) => Promise<Result<MemberPage>>;
  invitationsPage: (
    actor: Actor,
    input: z.input<typeof invitationPageInput>,
  ) => Promise<Result<InvitationPage>>;
  teamHistoryPage: (
    actor: Actor,
    input: z.input<typeof teamPageInput>,
  ) => Promise<Result<TeamHistoryPage>>;
  teamEvent: (
    actor: Actor,
    input: z.input<typeof teamEventInput>,
  ) => Promise<Result<TeamEventContent>>;
  workspacesPage: (
    actor: Actor,
    input: z.input<typeof workspacePageInput>,
  ) => Promise<{ status: "ok"; value: Workspace[]; nextCursor: string | null }>;
  team: (actor: Actor, input: z.input<typeof teamInput>) => Promise<Result<Team>>;
  inviteMember: (
    actor: Actor,
    input: z.input<typeof inviteMemberInput>,
  ) => Promise<Result<{ invitationId: string }>>;
  resendMemberInvitation: (
    actor: Actor,
    input: z.input<typeof teamInvitationInput>,
  ) => Promise<Result<{ invitationId: string; replacesInvitationId: string }>>;
  revokeMemberInvitation: (
    actor: Actor,
    input: z.input<typeof teamInvitationInput>,
  ) => Promise<Result<{ invitationId: string }>>;
  changeMember: (
    actor: Actor,
    input: z.input<typeof changeMemberInput>,
  ) => Promise<Result<MemberChange>>;
  removeMember: (actor: Actor, input: z.input<typeof memberInput>) => Promise<Result<MemberChange>>;
  workspaces: (actor: Actor) => Promise<{ status: "ok"; value: Workspace[] }>;
}
