import type { z } from "zod";

import type {
  Team,
  OrganizationProblem,
  inviteMemberInput,
  changeMemberInput,
  memberInput,
  teamInvitationInput,
} from "@merit/organizations/api";

export type { Team } from "@merit/organizations/api";

export type Member = Team["members"][number];

export type Invitation = Team["invitations"][number];

export type TeamSection = "members" | "invitations";

export type MutationResult =
  | { status: "ok"; value: unknown }
  | { status: OrganizationProblem | "signed_out" | "unavailable" };

export type InviteInput = z.infer<typeof inviteMemberInput>;

export type ChangeMemberInput = z.infer<typeof changeMemberInput>;

export type TeamData = {
  team: Team;
  fetching: boolean;
  invite: (input: InviteInput) => Promise<MutationResult>;
  changeMember: (input: ChangeMemberInput) => Promise<MutationResult>;
  removeMember: (input: z.infer<typeof memberInput>) => Promise<MutationResult>;
  resend: (input: z.infer<typeof teamInvitationInput>) => Promise<MutationResult>;
  revoke: (input: z.infer<typeof teamInvitationInput>) => Promise<MutationResult>;
  refresh: () => Promise<void>;
  refreshAfterSave: () => Promise<void>;
};

export type TeamReadResult =
  | { status: "ok"; value: Team }
  | { status: OrganizationProblem | "signed_out" | "unavailable" };

export type TeamTransport = Pick<
  TeamData,
  "invite" | "changeMember" | "removeMember" | "resend" | "revoke"
> & {
  read: (workspaceSlug: string, signal?: AbortSignal) => Promise<TeamReadResult>;
};
