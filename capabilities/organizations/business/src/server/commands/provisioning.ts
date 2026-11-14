import { permits } from "@merit/access";
import { type Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import { invitationProblem } from "../../domain/index";
import { recordOrganizationEvent } from "../persistence/commands/events";
import { lockOrganization } from "../persistence/commands/invitations";
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
  return state.invitations;
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
    await recordOrganizationEvent(tx, {
      organizationId: input.requestId,
      actor,
      action: "organization.created",
      target: { type: "organization", id: input.requestId, name: input.name },
      details: {
        name: input.name,
        slug: input.slug,
        invitationId: invitation.record.id,
      },
    });

    return { organizationId: input.requestId, invitation };
  });

export const renameOrganization = (db: Database, id: string, name: string, actor: Actor) =>
  db.transaction(async (tx) => {
    const before = (await lockOrganization(tx, id)) ?? fail("not_found");
    if (before.name === name) {
      return;
    }
    await persistence.renameOrganization(tx, id, name);
    await recordOrganizationEvent(tx, {
      organizationId: id,
      actor,
      action: "organization.renamed",
      target: { type: "organization", id: id, name: name },
      details: { before: before.name, after: name },
    });
  });

export const replaceInvitation = (db: Database, id: string, actor: Actor, email: string) =>
  db.transaction(async (tx) => {
    const organization = (await lockOrganization(tx, id)) ?? fail("not_found");
    const previous = await notJoined(tx, id);
    await persistence.revokeProvisioningInvitations(tx, id);
    const invitation = await issueInvitation(
      tx,
      { purpose: "provisioning", organizationId: id, email },
      actor,
    );
    await recordOrganizationEvent(tx, {
      organizationId: id,
      actor,
      target: { type: "team_invitation", id: previous[0]?.id ?? invitation.record.id, name: email },
      ...(previous[0]
        ? {
            action: "team_invitation.replaced" as const,
            details: { invitationId: previous[0].id, replacementId: invitation.record.id, email },
          }
        : {
            action: "team_invitation.issued" as const,
            details: { invitationId: invitation.record.id, email },
          }),
    });
    return { organization, invitation };
  });

export const revokeInvitation = (db: Database, id: string, actor: Actor) =>
  db.transaction(async (tx) => {
    if (!(await lockOrganization(tx, id))) {
      fail("not_found");
    }
    const previous = await notJoined(tx, id);
    await persistence.revokeProvisioningInvitations(tx, id);
    for (const invitation of previous) {
      await recordOrganizationEvent(tx, {
        organizationId: id,
        actor,
        action: "team_invitation.revoked",
        target: { type: "team_invitation", id: invitation.id, name: invitation.email },
        details: { invitationId: invitation.id, email: invitation.email },
      });
    }
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
    const canViewTeam = permits({ ...access, userId: user.id, active: user.active }, "read_team", {
      organizationId: organization.id,
    });
    if (invitation.acceptedAt) {
      if (invitation.acceptedBy !== user.id || !membership) {
        return fail("forbidden");
      }
      return { ...organization, canWorkOnGrants, canViewTeam };
    }
    if (membership) {
      return fail("membership_conflict");
    }

    await persistence.recordInvitationAcceptance(tx, invitation, actor, name);
    return { ...organization, canWorkOnGrants, canViewTeam };
  };

  return db.transaction(acceptInvitationTransaction);
};
