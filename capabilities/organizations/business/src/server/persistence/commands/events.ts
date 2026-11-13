import type { OrganizationSubject } from "@merit/access";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";

import type { Transaction } from "../transaction";
import type { Invitation } from "./invitations";

type Access = Pick<Invitation, "role" | "administration">;

type Event<Action, Target, Details> = {
  action: Action;
  target: { type: Target; id: string; name: string | null };
  details: Details;
};

type OrganizationEvent =
  | Event<
      "organization.created",
      "organization",
      { name: string; slug: string; invitationId: string }
    >
  | Event<"organization.renamed", "organization", { before: string; after: string }>
  | Event<
      "team_invitation.issued",
      "team_invitation",
      { invitationId: string; email: string } & Partial<Access>
    >
  | Event<
      "team_invitation.replaced",
      "team_invitation",
      { invitationId: string; replacementId: string; email: string }
    >
  | Event<"team_invitation.revoked", "team_invitation", { invitationId: string; email: string }>
  | Event<
      "team_invitation.accepted",
      "team_invitation",
      { invitationId: string; email: string } & Access
    >
  | Event<
      "membership.access_changed" | "membership.removed",
      "membership",
      {
        userId: string;
        targetName: string | null;
        before: Pick<OrganizationSubject, "role" | "administration">;
        after: Pick<OrganizationSubject, "role" | "administration"> | null;
        revokedInvitationIds: string[];
      }
    >;

export const recordOrganizationEvent = (
  tx: Transaction,
  input: OrganizationEvent & { organizationId: string; actor: Actor },
) =>
  recordAuditEvent(tx, {
    ...input,
    actor: { userId: input.actor.userId, provenance: actorProvenance(input.actor) },
    target: { ...input.target, name: input.target.name ?? undefined, revision: null },
  });
