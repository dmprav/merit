import type { z } from "zod";

import { permits } from "@merit/access";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import type { memberInput, changeMemberInput, inviteMemberInput } from "../../api/commands";
import { evaluateMemberChange } from "../../domain/index";
import { event, type Invitation } from "../persistence/commands/invitations";
import * as persistence from "../persistence/commands/team";
import type { Transaction } from "../persistence/transaction";
import { fail } from "../result";
import { issueInvitation } from "./issue-invitation";

const workspace = async (tx: Transaction, slug: string, actor: string) => {
  const organization = (await persistence.lockWorkspace(tx, slug)) ?? fail("not_found");
  const member = (await persistence.readSubject(tx, organization.id, actor)) ?? fail("forbidden");
  return { organization, member };
};

export const checkTeamIssuer = async (tx: Transaction, invitation: Invitation) => {
  const issuer =
    (await persistence.readSubject(tx, invitation.organizationId, invitation.invitedBy)) ??
    fail("forbidden");
  if (!permits(issuer, "manage_invitation", invitation)) {
    fail("forbidden");
  }
};

export const inviteMember = (
  db: Database,
  actor: Actor,
  input: z.infer<typeof inviteMemberInput>,
) =>
  db.transaction(async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor.userId);
    if (
      !permits(member, "manage_invitation", {
        organizationId: organization.id,
        administration: input.administration,
      })
    ) {
      fail("forbidden");
    }

    const previous = await persistence.findInvitationById(tx, input.requestId);
    if (previous) {
      if (
        previous.organizationId !== organization.id ||
        previous.email !== input.email ||
        previous.invitedBy !== actor.userId ||
        previous.administration !== input.administration ||
        previous.role !== input.role ||
        previous.purpose !== "team"
      ) {
        fail("invalid_input");
      }

      return { organization, invitation: null };
    }
    if (await persistence.findMemberByEmail(tx, organization.id, input.email)) {
      fail("membership_conflict");
    }
    if (await persistence.findPendingInvitation(tx, organization.id, input.email)) {
      fail("invitation_exists");
    }

    const invitation = await issueInvitation(
      tx,
      {
        purpose: "team",
        id: input.requestId,
        organizationId: organization.id,
        email: input.email,
        administration: input.administration,
        role: input.role,
      },
      actor,
    );
    await event(
      tx,
      organization.id,
      actor.userId,
      "invited",
      {
        invitationId: invitation.record.id,
        email: input.email,
        administration: input.administration,
        role: input.role,
      },
      actorProvenance(actor),
    );

    return { organization, invitation };
  });

const lockPendingInvitation = async (
  tx: Transaction,
  slug: string,
  actor: Actor,
  invitationId: string,
) => {
  const { organization, member } = await workspace(tx, slug, actor.userId);
  const invitation =
    (await persistence.findTeamInvitation(tx, organization.id, invitationId)) ?? fail("not_found");
  if (!permits(member, "manage_invitation", invitation)) {
    fail("forbidden");
  }
  if (invitation.acceptedAt) {
    fail("already_joined");
  }
  if (invitation.revokedAt) {
    fail("revoked");
  }

  return { organization, invitation };
};

export const resendTeamInvitation = (
  db: Database,
  slug: string,
  actor: Actor,
  invitationId: string,
) =>
  db.transaction(async (tx) => {
    const { organization, invitation: previous } = await lockPendingInvitation(
      tx,
      slug,
      actor,
      invitationId,
    );
    await persistence.revokeInvitation(tx, previous.id);
    const invitation = await issueInvitation(
      tx,
      {
        purpose: "team",
        organizationId: organization.id,
        email: previous.email,
        administration: previous.administration,
        role: previous.role,
      },
      actor,
    );
    await event(
      tx,
      organization.id,
      actor.userId,
      "invited",
      {
        invitationId: previous.id,
        replacementId: invitation.record.id,
        email: previous.email,
      },
      actorProvenance(actor),
    );

    return { organization, invitation };
  });

export const revokeTeamInvitation = (
  db: Database,
  slug: string,
  actor: Actor,
  invitationId: string,
) =>
  db.transaction(async (tx) => {
    const { organization, invitation } = await lockPendingInvitation(tx, slug, actor, invitationId);
    await persistence.revokeInvitation(tx, invitation.id);
    await event(
      tx,
      organization.id,
      actor.userId,
      "revoked",
      {
        invitationId,
        email: invitation.email,
      },
      actorProvenance(actor),
    );
  });

export const changeMember = (
  db: Database,
  actor: Actor,
  input: z.infer<typeof memberInput> | z.infer<typeof changeMemberInput>,
) =>
  db.transaction(async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor.userId);
    if (!permits(member, "manage_members", member)) {
      fail("forbidden");
    }

    const target =
      (await persistence.readMember(tx, organization.id, input.userId)) ?? fail("not_found");
    const decision = evaluateMemberChange(member, target, "role" in input ? input : null);
    if (decision.status !== "ok") {
      return fail(decision.status);
    }

    const { access, revokeIssuedInvitations } = decision.value;
    if (
      target.membershipId !== input.expectedMembershipId ||
      target.version !== input.expectedVersion
    ) {
      fail("conflict");
    }

    const issued = await persistence.readIssuedInvitations(tx, organization.id, target.userId);
    if (
      revokeIssuedInvitations &&
      issued
        .map((i) => i.id)
        .sort()
        .join() !== [...input.expectedInvitationIds].sort().join()
    ) {
      fail("conflict");
    }

    if (revokeIssuedInvitations) {
      await persistence.revokeIssuedInvitations(tx, organization.id, target.userId);
    }
    await persistence.writeMemberAccess(tx, organization.id, target.userId, access);
    await event(
      tx,
      organization.id,
      actor.userId,
      access ? "member_changed" : "member_removed",
      {
        userId: target.userId,
        targetName: target.name ?? target.email,
        before: { role: target.role, administration: target.administration },
        after: access,
        revokedInvitationIds: revokeIssuedInvitations ? issued.map((i) => i.id) : [],
      },
      actorProvenance(actor),
    );

    return {
      userId: target.userId,
      membershipId: target.membershipId,
      membershipVersion: access ? target.version + 1 : null,
      removed: access === null,
    };
  });
