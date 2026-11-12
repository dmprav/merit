import { and, eq, sql } from "drizzle-orm";

import type { OrganizationSubject } from "@merit/access";
import { appUsers } from "@merit/auth/schema";

import { memberships, organizations } from "../membership-schema";
import { invitations } from "../schema";
import { subjectQuery, pending } from "../team";
import type { Transaction } from "../transaction";

export const readSubject = async (tx: Transaction, organizationId: string, actor: string) =>
  (await subjectQuery(tx, organizationId, actor).for("share", { of: [memberships, appUsers] }))[0];

export const lockWorkspace = async (tx: Transaction, slug: string) => {
  const [organization] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .for("update");
  return organization;
};

export const findInvitationById = async (tx: Transaction, id: string) => {
  const [invitation] = await tx.select().from(invitations).where(eq(invitations.id, id));
  return invitation;
};

export const findMemberByEmail = async (tx: Transaction, organizationId: string, email: string) => {
  const [member] = await tx
    .select({ id: appUsers.id })
    .from(appUsers)
    .innerJoin(memberships, eq(memberships.userId, appUsers.id))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.email, email)));
  return member;
};

export const findPendingInvitation = async (
  tx: Transaction,
  organizationId: string,
  email: string,
) => {
  const [invitation] = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(pending(organizationId), eq(invitations.email, email)));
  return invitation;
};

export const findTeamInvitation = async (tx: Transaction, organizationId: string, id: string) => {
  const [invitation] = await tx
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.organizationId, organizationId),
        eq(invitations.purpose, "team"),
      ),
    );

  return invitation;
};

export const revokeInvitation = (tx: Transaction, id: string) =>
  tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));

export const readMember = async (tx: Transaction, organizationId: string, userId: string) => {
  const [member] = await tx
    .select({
      membershipId: memberships.id,
      name: appUsers.name,
      email: memberships.email,
      organizationId: memberships.organizationId,
      userId: appUsers.id,
      role: memberships.role,
      administration: memberships.administration,
      version: memberships.version,
    })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));

  return member;
};

const issuedBy = (organizationId: string, actor: string) =>
  and(pending(organizationId), eq(invitations.invitedBy, actor), eq(invitations.purpose, "team"));

export const readIssuedInvitations = (tx: Transaction, organizationId: string, actor: string) =>
  tx.select({ id: invitations.id }).from(invitations).where(issuedBy(organizationId, actor));

export const revokeIssuedInvitations = (tx: Transaction, organizationId: string, actor: string) =>
  tx.update(invitations).set({ revokedAt: new Date() }).where(issuedBy(organizationId, actor));

export const writeMemberAccess = async (
  tx: Transaction,
  organizationId: string,
  userId: string,
  access: Pick<OrganizationSubject, "role" | "administration"> | null,
) => {
  const where = and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId));
  if (!access) {
    await tx.delete(memberships).where(where);
  } else {
    await tx
      .update(memberships)
      .set({ ...access, version: sql`${memberships.version} + 1` })
      .where(where);
  }
};
