import { and, eq, sql } from "drizzle-orm";

import { organizations } from "../membership-schema";
import { invitations } from "../schema";
import type { Transaction } from "../transaction";

export const lockOrganization = async (tx: Transaction, id: string) => {
  const [row] = await tx.select().from(organizations).where(eq(organizations.id, id)).for("update");
  return row;
};

export type Invitation = typeof invitations.$inferInsert;

export const insertInvitation = (tx: Transaction, invitation: Invitation) =>
  tx.insert(invitations).values({ ...invitation, createdAt: sql`statement_timestamp()` });

export const readInvitationSendUsage = async (
  tx: Transaction,
  organizationId: string,
  email: string,
) => {
  const [usage] = await tx
    .select({
      recipientCoolingDown: sql<boolean>`coalesce(bool_or(${invitations.email} = ${email} AND ${invitations.createdAt} > statement_timestamp() - interval '1 minute'), false)`,
      hourCount: sql<number>`count(*) FILTER (WHERE ${invitations.createdAt} > statement_timestamp() - interval '1 hour')::integer`,
      dayCount: sql<number>`count(*)::integer`,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        sql`${invitations.createdAt} > statement_timestamp() - interval '1 day'`,
      ),
    );
  if (!usage) {
    throw new Error("Invitation usage query returned no aggregate row");
  }

  return usage;
};

export const canInviteToOrganization = async (tx: Transaction, organizationId: string) => {
  const [row] = await tx
    .select({ kind: organizations.kind })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return row?.kind === "standard";
};
