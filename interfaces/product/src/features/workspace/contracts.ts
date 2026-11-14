import type { InvitationMessage, OrganizationProblem } from "@merit/organizations/api";

export type RequestAccess = (input: {
  email: string;
}) => Promise<{ status: "ok" | "limited" | "invalid_input" | "unavailable" }>;

export type InvitationResult =
  | {
      status: "ok";
      value: {
        organization: { name: string };
        accepted: boolean;
        administration: InvitationMessage["administration"];
        role: InvitationMessage["role"];
      };
    }
  | { status: OrganizationProblem | "signed_out" | "unavailable" };

export type AcceptedWorkspace = { slug: string; canWorkOnGrants: boolean; canViewTeam: boolean };

export type InvitationAcceptance =
  | { status: "ok"; value: AcceptedWorkspace }
  | { status: OrganizationProblem | "signed_out" | "unavailable" };

export type InvitationData = {
  accept: () => Promise<InvitationAcceptance>;
  refreshAccess: () => Promise<void>;
};
