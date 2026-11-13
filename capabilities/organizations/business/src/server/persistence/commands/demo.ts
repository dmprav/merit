import { and, eq, lte, sql, lt } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";

import { demoEntryLimits } from "../demo-schema";
import { memberships, organizations } from "../membership-schema";
import { invitations } from "../schema";
import type { Transaction } from "../transaction";

export const lockDemoUser = async (db: Transaction, userId: string) => {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`demo:${userId}`}, 0))`);
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, userId)).for("share");
  return user;
};

export const expireDemo = (db: Transaction, id: string) =>
  db.update(organizations).set({ demoExpiresAt: new Date() }).where(eq(organizations.id, id));

export const insertDemo = async (
  db: Transaction,
  userId: string,
  seedVersion: number,
  expiresAt: Date,
) => {
  const id = crypto.randomUUID();
  const [workspace] = await db
    .insert(organizations)
    .values({
      id,
      name: "Alder Foundation",
      slug: `demo-${id}`,
      kind: "demo",
      demoExpiresAt: expiresAt,
      demoSeedVersion: seedVersion,
    })
    .returning();
  await db.insert(memberships).values({ organizationId: id, userId, role: "program_manager" });
  return workspace!;
};

export const lockExpiredDemo = async (db: Transaction, id: string) => {
  const [workspace] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, id),
        eq(organizations.kind, "demo"),
        lte(organizations.demoExpiresAt, new Date()),
      ),
    )
    .for("update");

  return workspace;
};

export const deleteDemo = async (db: Transaction, id: string) => {
  await db.delete(invitations).where(eq(invitations.organizationId, id));
  await db.delete(memberships).where(eq(memberships.organizationId, id));
  await db.delete(organizations).where(eq(organizations.id, id));
};

export const consumeDemoEntry = async (db: Transaction, key: string) => {
  const rows = await db
    .insert(demoEntryLimits)
    .values({ key, expiresAt: new Date(Date.now() + 3600000) })
    .onConflictDoUpdate({
      target: demoEntryLimits.key,
      set: { attempts: sql`${demoEntryLimits.attempts} + 1` },
      setWhere: lt(demoEntryLimits.attempts, 40),
    })
    .returning({ key: demoEntryLimits.key });

  return rows.length > 0;
};

export const removeOldDemoEntryLimits = (db: Transaction) =>
  db.delete(demoEntryLimits).where(lte(demoEntryLimits.expiresAt, new Date()));
