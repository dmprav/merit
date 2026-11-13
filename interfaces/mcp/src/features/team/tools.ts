import { z } from "zod";

import {
  teamInput,
  teamPageInput,
  teamHistoryInput,
  invitationPageInput,
  teamEventInput,
  inviteMemberInput,
  teamInvitationInput,
  changeMemberInput,
  memberInput,
} from "@merit/organizations/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { TeamOperations } from "./operations";
import {
  teamOverviewSchema,
  memberPageSchema,
  invitationPageSchema,
  teamHistoryPageSchema,
  teamEventSchema,
  invitationWriteSchema,
  memberWriteSchema,
  teamErrorSchema,
} from "./responses";

export const registerTeamTools = (
  register: RegisterTool,
  actor: McpActor,
  team: TeamOperations,
) => {
  register(
    "get_team",
    {
      description:
        "Read team identity, your current responsibilities and management permissions. Use list_team_members, list_team_invitations and list_team_history for bounded collections.",
      inputSchema: teamInput.strict(),
      outputSchema: teamOverviewSchema,
      errorSchema: teamErrorSchema,
      scope: "workspace:read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) => team.teamOverview(actor, input),
  );

  const read = {
    scope: "workspace:read" as const,
    errorSchema: teamErrorSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
  register(
    "list_team_members",
    {
      ...read,
      description:
        "List members in stable membershipId order; follow nextCursor. Read the original membership ID/version before changing access.",
      inputSchema: teamPageInput,
      outputSchema: memberPageSchema,
    },
    (input) => team.membersPage(actor, input),
  );
  register(
    "list_team_invitations",
    {
      ...read,
      description:
        "List pending invitations in stable ID order; follow nextCursor. Administrator access required. Filter issuedBy to collect the complete expectedInvitationIds before changing a member; changed invitations cause a conflict.",
      inputSchema: invitationPageInput,
      outputSchema: invitationPageSchema,
    },
    (input) => team.invitationsPage(actor, input),
  );
  register(
    "list_team_history",
    {
      ...read,
      description:
        "List access event metadata in stable eventId order; follow nextCursor. Administrator access required. Fetch event details separately.",
      inputSchema: teamHistoryInput,
      outputSchema: teamHistoryPageSchema,
    },
    (input) => team.teamHistoryPage(actor, input),
  );
  register(
    "get_team_event",
    {
      ...read,
      description:
        "Read bounded JSON text fragments of an immutable access event. Concatenate fragments before parsing. Offsets count Unicode characters; follow nextOffset until null. Administrator access required.",
      inputSchema: teamEventInput,
      outputSchema: teamEventSchema,
    },
    (input) => team.teamEvent(actor, input),
  );

  registerTeamInvitations(register, actor, team);
  registerMembershipWrites(register, actor, team);
};

const registerTeamInvitations = (register: RegisterTool, actor: McpActor, team: TeamOperations) => {
  register(
    "invite_member",
    {
      description:
        "Invite a colleague with explicit responsibilities. Sends an invitation email after saving. Requires team:write and current administrator/owner authority. Reuse requestId on retry; inspect list_team_invitations for delivery status.",
      inputSchema: inviteMemberInput.strict(),
      outputSchema: invitationWriteSchema,
      errorSchema: teamErrorSchema,
      scope: "team:write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (input) => team.inviteMember(actor, input),
  );

  register(
    "resend_member_invitation",
    {
      description:
        "Replace a pending team invitation and send a new email. Requires team:write. On response loss, reread list_team_invitations before another attempt; the old invitation is revoked.",
      inputSchema: teamInvitationInput.strict(),
      outputSchema: invitationWriteSchema,
      errorSchema: teamErrorSchema,
      scope: "team:write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (input) => team.resendMemberInvitation(actor, input),
  );

  register(
    "revoke_member_invitation",
    {
      description: "Revoke a pending team invitation. Requires team:write and current authority.",
      inputSchema: teamInvitationInput.strict(),
      outputSchema: invitationWriteSchema,
      errorSchema: teamErrorSchema,
      scope: "team:write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) => team.revokeMemberInvitation(actor, input),
  );
};

const registerMembershipWrites = (
  register: RegisterTool,
  actor: McpActor,
  team: TeamOperations,
) => {
  register(
    "change_member",
    {
      description:
        "Change a member's responsibilities using the current membership ID/version and expected IDs of invitations they issued. Reduced authority may revoke those invitations. Owner protections apply.",
      inputSchema: changeMemberInput
        .omit({ expectedVersion: true })
        .extend({ expectedMembershipVersion: z.number().int().nonnegative() })
        .strict(),
      outputSchema: memberWriteSchema,
      errorSchema: teamErrorSchema,
      scope: "team:write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ expectedMembershipVersion, ...input }) =>
      team.changeMember(actor, { ...input, expectedVersion: expectedMembershipVersion }),
  );

  register(
    "remove_member",
    {
      description:
        "Remove workspace membership using the current membership ID/version and expected IDs of invitations they issued. Owner and self-removal protections apply. Subsequent reads/writes lose access.",
      inputSchema: memberInput
        .omit({ expectedVersion: true })
        .extend({ expectedMembershipVersion: z.number().int().nonnegative() })
        .strict(),
      outputSchema: memberWriteSchema,
      errorSchema: teamErrorSchema,
      scope: "team:write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ expectedMembershipVersion, ...input }) =>
      team.removeMember(actor, { ...input, expectedVersion: expectedMembershipVersion }),
  );
};
