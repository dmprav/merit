import type { Database } from "@merit/db";

import { findOrCreateAccountUser } from "./persistence/identity";

/** The subject must already be verified by the identity provider. */
export const resolveAccountUser = async (
  db: Database,
  clerkUserId: string,
): Promise<{ status: "active"; userId: string } | { status: "disabled" }> => {
  const user = await findOrCreateAccountUser(db, clerkUserId);
  return user.active ? { status: "active", userId: user.id } : { status: "disabled" };
};
