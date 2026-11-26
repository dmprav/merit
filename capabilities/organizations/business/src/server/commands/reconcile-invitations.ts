import type { Dependencies } from "../dependencies";
import { hashToken, openInvitationToken } from "../invitation-token";
import {
  acknowledgeInvitationDispatch,
  listPendingInvitationDispatches,
} from "../persistence/invitations";

/** Repeated and overlapping starts use the invitation ID. Only an accepted start releases the token. */
export const reconcileOrganizationInvitations = async ({
  database,
  invitationKey,
  start,
}: Pick<Dependencies, "database" | "invitationKey" | "start">) => {
  const pageSize = 100;
  let after = "";
  let listed = 0;
  let handedOff = 0;
  let unreadable = false;
  for (;;) {
    const page = await database((db) => listPendingInvitationDispatches(db, pageSize, after));
    for (const { invitationId, ciphertext } of page) {
      listed += 1;
      let token: string;
      try {
        token = openInvitationToken(invitationKey(), invitationId, ciphertext);
      } catch {
        // Continue past damaged envelopes. Report the scan without exposing any payload.
        unreadable = true;
        continue;
      }
      if (await start({ invitationId, token })) {
        const hash = await hashToken(token);
        await database((db) => acknowledgeInvitationDispatch(db, invitationId, hash));
        handedOff += 1;
      }
    }
    const last = page.at(-1);
    if (!last || page.length < pageSize) {
      break;
    }
    after = last.invitationId;
  }
  if (unreadable) {
    throw new Error("Invitation dispatch data could not be decrypted.");
  }
  return { listed, handedOff };
};
