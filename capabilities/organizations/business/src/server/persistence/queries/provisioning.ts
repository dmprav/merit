import { and, eq, isNull, desc, sql } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";

import { memberships, organizations } from "../membership-schema";
import { invitations } from "../schema";

const organizationQuery = (db: Database) =>
  db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      hasOwner: sql<boolean>`${memberships.userId} IS NOT NULL`,
    })
    .from(organizations)
    .leftJoin(
      memberships,
      and(
        eq(memberships.organizationId, organizations.id),
        eq(memberships.administration, "owner"),
      ),
    );

export const listOrganizations = async (db: Database) => {
  const rows = await organizationQuery(db).orderBy(organizations.name, organizations.id);
  const invites = await db
    .select({
      organizationId: invitations.organizationId,
      email: invitations.email,
      acceptedAt: invitations.acceptedAt,
      expiresAt: invitations.expiresAt,
      delivery: invitations.delivery,
    })
    .from(invitations)
    .where(and(isNull(invitations.revokedAt), eq(invitations.purpose, "provisioning")));

  return rows.map((row) => ({
    ...row,
    invitation: invites.find((invite) => invite.organizationId === row.id) ?? null,
  }));
};

export const readOrganization = async (db: Database, id: string) => {
  const [row] = await organizationQuery(db).where(eq(organizations.id, id));
  if (!row) {
    return null;
  }

  const invites = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      delivery: invitations.delivery,
    })
    .from(invitations)
    .where(and(eq(invitations.organizationId, id), eq(invitations.purpose, "provisioning")))
    .orderBy(desc(isNull(invitations.revokedAt)), desc(invitations.createdAt), desc(invitations.id))
    .limit(1);
  const owners = await db
    .select({ name: appUsers.name })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(eq(memberships.organizationId, id), eq(memberships.administration, "owner")));

  return { ...row, owner: owners.at(0) ?? null, invitation: invites.at(0) ?? null };
};
