import { eq } from "drizzle-orm";

import type { Database } from "@merit/db";

import { organizations } from "./membership-schema";
import { invitations } from "./schema";

export const findInvitation = async (db: Database, hash: string) => {
  const [row] = await db
    .select({ invitation: invitations, organization: organizations })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.tokenHash, hash));
  return row;
};

/** The invitation a delivery acts on, with the organization name its email shows. */
export const readInvitationForDelivery = async (db: Database, id: string) => {
  const [row] = await db
    .select({ invitation: invitations, organizationName: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.id, id));
  return row;
};
