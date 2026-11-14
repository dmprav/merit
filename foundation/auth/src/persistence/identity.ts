import { and, eq, gt, lte, sql } from "drizzle-orm";

import type { Database } from "@merit/db";

import { appUsers, guestSessions } from "./schema";

const guestLifetime = 7 * 24 * 60 * 60 * 1000;

const tokenHash = async (token: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

/** Provider verification happens before this mapping; existing disabled users stay disabled. */
export const findOrCreateAccountUser = async (db: Database, clerkUserId: string) => {
  const [existing] = await db.select().from(appUsers).where(eq(appUsers.clerkUserId, clerkUserId));
  if (existing) {
    return existing;
  }

  await db
    .insert(appUsers)
    .values({ id: crypto.randomUUID(), clerkUserId })
    .onConflictDoNothing({ target: appUsers.clerkUserId });
  const [user] = await db.select().from(appUsers).where(eq(appUsers.clerkUserId, clerkUserId));
  if (!user) {
    throw new Error("Account mapping was not persisted");
  }
  return user;
};

export const createGuestSession = async (db: Database, name: string) => {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const userId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + guestLifetime);
  const hash = await tokenHash(token);
  await db.transaction(async (tx) => {
    await tx.insert(appUsers).values({ id: userId, name });
    await tx.insert(guestSessions).values({ tokenHash: hash, userId, expiresAt });
  });

  return { token, userId, expiresAt };
};

export const resolveGuestSession = async (db: Database, token: string) => {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const [session] = await db
    .select({ userId: guestSessions.userId, expiresAt: guestSessions.expiresAt })
    .from(guestSessions)
    .innerJoin(appUsers, eq(appUsers.id, guestSessions.userId))
    .where(
      and(
        eq(guestSessions.tokenHash, await tokenHash(token)),
        gt(guestSessions.expiresAt, sql`statement_timestamp()`),
        eq(appUsers.active, true),
      ),
    );

  return session ?? null;
};

/** Explicit demo entry can extend a live session; expired tokens never regain access. */
export const renewGuestSession = async (db: Database, token: string) => {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const expiresAt = new Date(Date.now() + guestLifetime);
  const [session] = await db
    .update(guestSessions)
    .set({ expiresAt })
    .where(
      and(
        eq(guestSessions.tokenHash, await tokenHash(token)),
        gt(guestSessions.expiresAt, sql`statement_timestamp()`),
        sql`EXISTS (SELECT 1 FROM ${appUsers} WHERE ${appUsers.id} = ${guestSessions.userId} AND ${appUsers.active} = true)`,
      ),
    )
    .returning({ userId: guestSessions.userId, expiresAt: guestSessions.expiresAt });

  return session ?? null;
};

/** Inactive attribution identities cannot take over an account or an active user. */
export const ensureInactiveUser = async (db: Database, identity: { id: string; name: string }) => {
  await db
    .insert(appUsers)
    .values({ ...identity, active: false })
    .onConflictDoNothing({ target: appUsers.id });
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, identity.id));
  if (!user || user.active || user.clerkUserId !== null) {
    throw new Error("Inactive identity conflicts with an existing user");
  }
  return user.id;
};

/**
 * Process at most 100 users after the cursor, including users retained by canRemove.
 * Continue with nextCursor until null; the owning capability checks membership in the transaction.
 */
export const removeExpiredGuestBatch = async (
  db: Database,
  canRemove: (tx: Database, userId: string) => Promise<boolean>,
  afterUserId?: string,
) => {
  const candidates = await db
    .selectDistinct({ userId: guestSessions.userId })
    .from(guestSessions)
    .where(
      and(
        lte(guestSessions.expiresAt, sql`statement_timestamp()`),
        afterUserId === undefined ? undefined : gt(guestSessions.userId, afterUserId),
      ),
    )
    .orderBy(guestSessions.userId)
    .limit(100);
  let removed = 0;
  for (const { userId } of candidates) {
    await db.transaction(async (tx) => {
      const [user] = await tx.select().from(appUsers).where(eq(appUsers.id, userId)).for("update");
      if (!user || user.clerkUserId !== null) {
        return;
      }

      const [active] = await tx
        .select({ userId: guestSessions.userId })
        .from(guestSessions)
        .where(
          and(
            eq(guestSessions.userId, userId),
            gt(guestSessions.expiresAt, sql`statement_timestamp()`),
          ),
        )
        .limit(1);
      if (active || !(await canRemove(tx, userId))) {
        return;
      }

      await tx.delete(guestSessions).where(eq(guestSessions.userId, userId));
      await tx.delete(appUsers).where(eq(appUsers.id, userId));
      removed++;
    });
  }
  return {
    removed,
    nextCursor: candidates.length === 100 ? (candidates.at(-1)?.userId ?? null) : null,
  };
};
