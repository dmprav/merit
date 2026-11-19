import type { Transaction } from "@merit/db";

import { selectContact } from "../scope";

/** Hold the authorized contact's profile stable while recording its details or checking its revision. */
export const lockContactProfile = async (
  tx: Transaction,
  organizationId: string,
  id: string,
  mode: "share" | "no key update",
) => (await selectContact(tx, organizationId, id).for(mode))[0];
