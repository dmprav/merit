import { permits } from "@merit/access";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import { invitationProblem } from "../../domain/index";
import { event, lockOrganization } from "../persistence/commands/invitations";
import * as persistence from "../persistence/commands/provisioning";
import { findInvitation } from "../persistence/invitations";
import type { Transaction } from "../persistence/transaction";
import { fail } from "../result";
import { issueInvitation } from "./issue-invitation";
import { checkTeamIssuer } from "./team";

const notJoined = async (tx: Transaction, id: string) => {
  const state = await persistence.readOnboardingState(tx, id);
  if (state.owner || state.invitations.some((invitation) => invitation.acceptedAt)) {
    fail("already_joined");
  }
};

export const createOrganization = (
  db: Database,
  input: { requestId: string; name: string; slug: string; email: string },
  actor: Actor,
) =>
  db.transaction(async (tx) => {
    // Serialize an identical retried request without resending or rotating its invitation.
    const inserted = await persistence.insertOrganization(tx, input);
    if (!inserted) {
      const { organization, invitation: original } = await persistence.readProvisioningRequest(
        tx,
        input.requestId,
      );
      if (!organization) {
        return fail("address_taken");
      }
      if (
        organization.slug !== input.slug ||
        organization.name !== input.name ||
        original?.email !== input.email
      ) {
        return fail("invalid_input");
      }

      return { organizationId: organization.id, invitation: null };
    }

    const invitation = await issueInvitation(
      tx,
      {
        purpose: "provisioning",
        organizationId: input.requestId,
        email: input.email,
      },
      actor,
    );
    await event(
      tx,
      input.requestId,
      actor.userId,
      "created",
      {
        name: input.name,
        slug: input.slug,
        invitationId: invitation.record.id,
      },
      actorProvenance(actor),
    );

    return { organizationId: input.requestId, invitation };
  });

export const renameOrganization = (db: Database, id: string, name: string, actor: Actor) =>
  db.transaction(async (tx) => {
    const before = (await lockOrganization(tx, id)) ?? fail("not_found");
    await persistence.renameOrganization(tx, id, name);
    await event(
      tx,
      id,
      actor.userId,
      "renamed",
      { before: before.name, after: name },
      actorProvenance(actor),
    );
  });

export const replaceInvitation = (db: Database, id: string, actor: Actor, email: string) =>
  db.transaction(async (tx) => {
    const organization = (await lockOrganization(tx, id)) ?? fail("not_found");
    await notJoined(tx, id);
    await persistence.revokeProvisioningInvitations(tx, id);
    const invitation = await issueInvitation(
      tx,
      { purpose: "provisioning", organizationId: id, email },
      actor,
    );
    await event(
      tx,
      id,
      actor.userId,
      "invited",
      { invitationId: invitation.record.id, email },
      actorProvenance(actor),
    );
    return { organization, invitation };
  });

export const revokeInvitation = (db: Database, id: string, actor: Actor) =>
  db.transaction(async (tx) => {
    if (!(await lockOrganization(tx, id))) {
      fail("not_found");
    }
    await notJoined(tx, id);
    await persistence.revokeProvisioningInvitations(tx, id);
    await event(tx, id, actor.userId, "revoked", {}, actorProvenance(actor));
  });

export const acceptInvitation = (
  db: Database,
  hash: string,
  actor: Actor,
  emails: string[],
  name?: string | null,
) => {
  const acceptInvitationTransaction = async (tx: Transaction) => {
    const initial = (await findInvitation(tx, hash)) ?? fail("not_found");
    if (!(await lockOrganization(tx, initial.organization.id))) {
      fail("not_found");
    }

    const { invitation, organization } = (await findInvitation(tx, hash)) ?? fail("not_found");
    if (organization.kind === "demo") {
      fail("forbidden");
    }

    const problem = invitationProblem(invitation, emails, new Date());
    if (problem) {
      fail(problem);
    }

    if (invitation.purpose === "team" && !invitation.acceptedAt) {
      await checkTeamIssuer(tx, invitation);
    }
    const user = (await persistence.lockUser(tx, actor.userId)) ?? fail("forbidden");
    if (!user.active) {
      return fail("disabled");
    }

    const membership = await persistence.lockMembership(tx, organization.id, user.id);
    const access = membership ?? invitation;
    const canWorkOnGrants = permits(
      { ...access, userId: user.id, active: user.active },
      "work_on_grants",
      { organizationId: organization.id },
    );
    if (invitation.acceptedAt) {
      if (invitation.acceptedBy !== user.id || !membership) {
        return fail("forbidden");
      }
      return { ...organization, canWorkOnGrants };
    }
    if (membership) {
      return fail("membership_conflict");
    }

    await persistence.recordInvitationAcceptance(tx, invitation, actor, name);
    return { ...organization, canWorkOnGrants };
  };

  return db.transaction(acceptInvitationTransaction);
};
