import type { Actor } from "@merit/auth";
import type { Transaction } from "@merit/db";

import type { Dependencies } from "../dependencies";
import { hashToken, sealInvitationToken } from "../invitation-token";
import {
  insertInvitation,
  canInviteToOrganization,
  readInvitationSendUsage,
  type Invitation,
} from "../persistence/commands/invitations";
import { fail } from "../result";

type InvitationRequest = {
  organizationId: string;
  email: string;
} & (
  | { purpose: "provisioning" }
  | {
      purpose: "team";
      id?: string;
      administration: NonNullable<Invitation["administration"]>;
      role: NonNullable<Invitation["role"]>;
    }
);

/**
 * Caller authorizes responsibilities and locks (or creates) the organization.
 * Commit before delivering the returned invitation.
 */
export const issueInvitation = async (
  tx: Transaction,
  request: InvitationRequest,
  actor: Actor,
  invitationKey: Dependencies["invitationKey"],
) => {
  if (!(await canInviteToOrganization(tx, request.organizationId))) {
    fail("forbidden");
  }

  const usage = await readInvitationSendUsage(tx, request.organizationId, request.email);
  if (usage.recipientCoolingDown) {
    fail("invitation_cooldown");
  }
  if (usage.hourCount >= 20) {
    fail("invitation_hourly_limit");
  }
  if (usage.dayCount >= 100) {
    fail("invitation_daily_limit");
  }

  const invitation = await prepareInvitation(request, actor);
  const inserted = await insertInvitation(tx, {
    ...invitation.record,
    dispatchCiphertext: sealInvitationToken(
      invitationKey(),
      invitation.record.id,
      invitation.token,
    ),
  });
  if (inserted.rowCount !== 1) {
    fail("invalid_input");
  }
  return invitation;
};

const prepareInvitation = async (request: InvitationRequest, actor: Actor) => {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const record = {
    id: (request.purpose === "team" ? request.id : undefined) ?? crypto.randomUUID(),
    organizationId: request.organizationId,
    email: request.email,
    purpose: request.purpose,
    administration:
      request.purpose === "provisioning" ? ("owner" as const) : request.administration,
    role: request.purpose === "provisioning" ? ("program_manager" as const) : request.role,
    tokenHash: await hashToken(token),
    invitedBy: actor.userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
  return { token, record };
};

export type IssuedInvitation = Awaited<ReturnType<typeof issueInvitation>>;
