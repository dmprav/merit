import { evaluateMemberAccess, type OrganizationSubject } from "@merit/access";

export const revokesIssuedInvitations = (
  before: OrganizationSubject["administration"],
  after: OrganizationSubject["administration"] | null,
) => after === null || (before === "administrator" && after === "none");

export const evaluateMemberChange = (...args: Parameters<typeof evaluateMemberAccess>) => {
  const decision = evaluateMemberAccess(...args);
  if (decision.status !== "ok") {
    return decision;
  }

  return {
    status: "ok" as const,
    value: {
      access: decision.value,
      revokeIssuedInvitations: revokesIssuedInvitations(
        args[1].administration,
        decision.value?.administration ?? null,
      ),
    },
  };
};

export const invitationProblem = (
  invitation: { email: string; acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  verifiedEmails: readonly string[],
  now: Date,
): "wrong_account" | "revoked" | "expired" | null => {
  if (!verifiedEmails.includes(invitation.email)) {
    return "wrong_account";
  }
  if (invitation.revokedAt) {
    return "revoked";
  }
  if (!invitation.acceptedAt && invitation.expiresAt <= now) {
    return "expired";
  }

  return null;
};
