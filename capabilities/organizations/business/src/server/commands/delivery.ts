import type { Dependencies } from "../dependencies";
import { recordDelivery } from "../persistence/commands/provisioning";
import type { IssuedInvitation } from "./issue-invitation";

export const createDelivery = (
  dependencies: Pick<Dependencies, "database" | "sendInvitation" | "invitationUrl">,
) => {
  const deliver = async (invitation: IssuedInvitation, name: string) => {
    let delivery: "sent" | "failed" = "failed";
    try {
      await dependencies.sendInvitation({
        id: invitation.record.id,
        to: invitation.record.email,
        organizationName: name,
        expiresAt: invitation.record.expiresAt,
        administration: invitation.record.administration,
        role: invitation.record.role,
        url: dependencies.invitationUrl(invitation.token),
      });
      delivery = "sent";
    } catch {
      /* The saved invitation remains recoverable after sending fails. */
    }

    try {
      await dependencies.database((db) =>
        db.transaction((tx) => recordDelivery(tx, invitation.record.id, delivery)),
      );
    } catch {
      console.error("Invitation delivery outcome could not be recorded.");
    }
  };

  return deliver;
};
