import { and, eq, isNull } from "drizzle-orm";

import { actorProvenance, type Actor } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";

import { memberships, organizations } from "../membership-schema";
import { invitations } from "../schema";
import type { Transaction } from "../transaction";
import { event } from "./invitations";

export const insertOrganization = async (
  tx: Transaction,
  input: { requestId: string; name: string; slug: string },
) => {
  const rows = await tx
    .insert(organizations)
    .values({ id: input.requestId, name: input.name, slug: input.slug })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
};

export const readProvisioningRequest = async (tx: Transaction, id: string) => {
  const [organization] = await tx.select().from(organizations).where(eq(organizations.id, id));
  const [invitation] = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.organizationId, id), eq(invitations.purpose, "provisioning")))
    .orderBy(invitations.createdAt)
    .limit(1);

  return { organization, invitation };
};

export const readOnboardingState = async (tx: Transaction, id: string) => {
  const [owner] = await tx
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, id), eq(memberships.administration, "owner")));
  const invites = await tx
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, id),
        eq(invitations.purpose, "provisioning"),
        isNull(invitations.revokedAt),
      ),
    );

  return { owner, invitations: invites };
};

export const renameOrganization = (tx: Transaction, id: string, name: string) =>
  tx.update(organizations).set({ name }).where(eq(organizations.id, id));

export const revokeProvisioningInvitations = (tx: Transaction, id: string) =>
  tx
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.organizationId, id),
        eq(invitations.purpose, "provisioning"),
        isNull(invitations.revokedAt),
      ),
    );

export const recordDelivery = (db: Transaction, id: string, delivery: "sent" | "failed") =>
  db
    .update(invitations)
    .set({ delivery })
    .where(
      and(eq(invitations.id, id), isNull(invitations.revokedAt), isNull(invitations.acceptedAt)),
    );

export const lockUser = async (tx: Transaction, actor: string) => {
  const [user] = await tx.select().from(appUsers).where(eq(appUsers.id, actor)).for("update");
  return user;
};

export const lockMembership = async (tx: Transaction, organizationId: string, userId: string) => {
  const [membership] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
    .for("update");
  return membership;
};

export const recordInvitationAcceptance = async (
  tx: Transaction,
  invitation: Pick<
    typeof invitations.$inferSelect,
    "id" | "organizationId" | "role" | "administration" | "email"
  >,
  actor: Actor,
  name?: string | null,
) => {
  const userId = actor.userId;
  if (name) {
    await tx.update(appUsers).set({ name }).where(eq(appUsers.id, userId));
  }
  await tx.insert(memberships).values({
    organizationId: invitation.organizationId,
    userId,
    role: invitation.role,
    administration: invitation.administration,
    email: invitation.email,
  });
  await tx
    .update(invitations)
    .set({ acceptedAt: new Date(), acceptedBy: userId })
    .where(eq(invitations.id, invitation.id));
  await event(
    tx,
    invitation.organizationId,
    userId,
    "accepted",
    { invitationId: invitation.id },
    actorProvenance(actor),
  );
};
