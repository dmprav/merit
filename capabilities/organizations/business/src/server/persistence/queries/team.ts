import { and, eq, sql, desc, gt } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";

import { memberships, organizations } from "../membership-schema";
import { invitations, organizationEvents } from "../schema";
import { subjectQuery, pending } from "../team";
import type { Transaction } from "../transaction";

export const readSubject = async (tx: Transaction, organizationId: string, actor: string) =>
  (await subjectQuery(tx, organizationId, actor))[0];

export const readWorkspace = async (tx: Transaction, slug: string) => {
  const [organization] = await tx.select().from(organizations).where(eq(organizations.slug, slug));
  return organization;
};

export const readMembers = (
  tx: Transaction,
  organizationId: string,
  page?: { after?: string; limit: number },
) => {
  const query = tx
    .select({
      userId: appUsers.id,
      organizationId: memberships.organizationId,
      membershipId: memberships.id,
      name: appUsers.name,
      email: memberships.email,
      active: appUsers.active,
      administration: memberships.administration,
      role: memberships.role,
      version: memberships.version,
    })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        page?.after ? gt(memberships.id, page.after) : undefined,
      ),
    )
    .orderBy(...(page ? [memberships.id] : [appUsers.name, memberships.email, appUsers.id]));
  return page ? query.limit(page.limit + 1) : query;
};

export const readPendingInvitations = (
  tx: Transaction,
  organizationId: string,
  page?: { after?: string; limit: number; issuedBy?: string },
) => {
  const query = tx
    .select({
      id: invitations.id,
      email: invitations.email,
      administration: invitations.administration,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      delivery: invitations.delivery,
      invitedBy: appUsers.id,
    })
    .from(invitations)
    .leftJoin(appUsers, eq(appUsers.id, invitations.invitedBy))
    .where(
      and(
        pending(organizationId),
        eq(invitations.purpose, "team"),
        page?.after ? gt(invitations.id, page.after) : undefined,
        page?.issuedBy ? eq(invitations.invitedBy, page.issuedBy) : undefined,
      ),
    )
    .orderBy(...(page ? [invitations.id] : [invitations.createdAt, invitations.id]));
  return page ? query.limit(page.limit + 1) : query;
};

export const readTeamHistory = (tx: Transaction, organizationId: string) =>
  tx
    .select({
      id: organizationEvents.id,
      action: organizationEvents.action,
      actor: appUsers.name,
      provenance: organizationEvents.provenance,
      recordedAt: organizationEvents.recordedAt,
      details: organizationEvents.details,
    })
    .from(organizationEvents)
    .leftJoin(appUsers, eq(appUsers.id, organizationEvents.actorUserId))
    .where(eq(organizationEvents.organizationId, organizationId))
    .orderBy(desc(organizationEvents.recordedAt), organizationEvents.id);

export const readTeamHistoryPage = (
  tx: Transaction,
  organizationId: string,
  page: { after?: string; limit: number },
) =>
  tx
    .select({
      eventId: organizationEvents.id,
      action: organizationEvents.action,
      actor: appUsers.name,
      provenance: organizationEvents.provenance,
      recordedAt: organizationEvents.recordedAt,
    })
    .from(organizationEvents)
    .leftJoin(appUsers, eq(appUsers.id, organizationEvents.actorUserId))
    .where(
      and(
        eq(organizationEvents.organizationId, organizationId),
        page.after ? gt(organizationEvents.id, page.after) : undefined,
      ),
    )
    .orderBy(organizationEvents.id)
    .limit(page.limit + 1);

export const readTeamEvent = async (
  tx: Transaction,
  organizationId: string,
  input: { eventId: string; offset: number; length: number },
) =>
  (
    await tx
      .select({
        content: sql<string>`substring(${organizationEvents.details}::text from ${input.offset + 1}::integer for ${input.length}::integer)`,
        totalCharacters: sql<number>`char_length(${organizationEvents.details}::text)`,
      })
      .from(organizationEvents)
      .where(
        and(
          eq(organizationEvents.organizationId, organizationId),
          eq(organizationEvents.id, input.eventId),
        ),
      )
  )[0];
