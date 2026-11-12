import { eq } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { appUsers, guestSessions } from "@merit/auth/schema";
import {
  createGuestSession,
  deleteExpiredGuestSessions,
  ensureInactiveUser,
  removeExpiredGuestBatch,
  renewGuestSession,
  resolveAccountUser,
  resolveGuestSession,
} from "@merit/auth/server";
import { databaseTest as it } from "@merit/test-support/database";

it("resolves a verified account to one internal identity without reactivating disabled users", async ({
  db,
}) => {
  const [first, second] = await Promise.all([
    resolveAccountUser(db, "account_one"),
    resolveAccountUser(db, "account_one"),
  ]);

  assert(first.status === "active");
  expect(second).toEqual(first);
  expect(first.userId).not.toBe("account_one");

  await db.update(appUsers).set({ active: false }).where(eq(appUsers.id, first.userId));

  expect(await resolveAccountUser(db, "account_one")).toEqual({ status: "disabled" });
  const [stored] = await db.select().from(appUsers).where(eq(appUsers.id, first.userId));
  expect(stored?.active).toBe(false);
});

it("keeps guest bearer tokens out of storage and isolates each guest identity", async ({ db }) => {
  const first = await createGuestSession(db, "First guest");
  const second = await createGuestSession(db, "Second guest");

  expect(first.userId).not.toBe(second.userId);
  expect(await resolveGuestSession(db, first.token)).toEqual({
    userId: first.userId,
    expiresAt: first.expiresAt,
  });
  expect(await resolveGuestSession(db, "untrusted")).toBeNull();
  expect(await resolveGuestSession(db, "0".repeat(64))).toBeNull();

  const stored = await db.select().from(guestSessions);

  expect(stored.some((session) => session.tokenHash === first.token)).toBe(false);
  expect(stored.some((session) => session.tokenHash === second.token)).toBe(false);

  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, first.userId));

  assert.isDefined(user);
  expect(user.clerkUserId).toBeNull();
  expect(user.name).toBe("First guest");
});

it("denies expired and disabled guest sessions before cleanup and never renews them", async ({
  db,
}) => {
  const expired = await createGuestSession(db, "Expired guest");
  const disabled = await createGuestSession(db, "Disabled guest");
  const current = await createGuestSession(db, "Current guest");
  await db
    .update(guestSessions)
    .set({ expiresAt: new Date(0) })
    .where(eq(guestSessions.userId, expired.userId));
  await db.update(appUsers).set({ active: false }).where(eq(appUsers.id, disabled.userId));

  for (const session of [expired, disabled]) {
    expect(await resolveGuestSession(db, session.token)).toBeNull();
    expect(await renewGuestSession(db, session.token)).toBeNull();
  }

  expect((await renewGuestSession(db, current.token))?.userId).toBe(current.userId);

  await deleteExpiredGuestSessions(db);

  expect(await resolveGuestSession(db, current.token)).not.toBeNull();
  expect(
    await db.select().from(guestSessions).where(eq(guestSessions.userId, expired.userId)),
  ).toHaveLength(0);
});

it("creates a repeatable inactive attribution identity without modifying existing accounts", async ({
  db,
}) => {
  const identity = { id: "example-author", name: "Example author" };
  expect(await ensureInactiveUser(db, identity)).toBe(identity.id);
  expect(await ensureInactiveUser(db, identity)).toBe(identity.id);
  expect(await db.select().from(appUsers)).toEqual([
    { ...identity, active: false, clerkUserId: null },
  ]);

  await db.insert(appUsers).values([
    { id: "active-user", name: "Active user" },
    { id: "disabled-account", clerkUserId: "account", active: false },
  ]);
  for (const id of ["active-user", "disabled-account"]) {
    await expect(ensureInactiveUser(db, { id, name: "Replacement" })).rejects.toThrow(
      "Inactive identity conflicts with an existing user",
    );
  }
  const [active] = await db.select().from(appUsers).where(eq(appUsers.id, "active-user"));
  expect(active).toMatchObject({ name: "Active user", active: true });
});

it.for([0, 100])(
  "continues guest cleanup past the first batch with %i retained users",
  async (retained, { db }) => {
    const users = Array.from({ length: 102 }, (_, index) => ({
      id: `guest-${String(index).padStart(3, "0")}`,
    }));
    await db.insert(appUsers).values(users);
    await db.insert(guestSessions).values(
      users.map(({ id }) => ({
        userId: id,
        tokenHash: id,
        expiresAt: new Date(0),
      })),
    );

    const visited: string[] = [];

    const canRemove: Parameters<typeof removeExpiredGuestBatch>[1] = async (_tx, id) => {
      visited.push(id);
      return Number(id.slice("guest-".length)) >= retained;
    };

    const first = await removeExpiredGuestBatch(db, canRemove);
    expect(first).toEqual({ removed: 100 - retained, nextCursor: "guest-099" });
    const second = await removeExpiredGuestBatch(db, canRemove, first.nextCursor ?? undefined);
    expect(second).toEqual({ removed: 2, nextCursor: null });
    expect(visited).toEqual(users.map(({ id }) => id));
    const remaining = users.slice(0, retained);
    expect(await db.select({ id: appUsers.id }).from(appUsers).orderBy(appUsers.id)).toEqual(
      remaining,
    );
    expect(
      await db
        .select({ userId: guestSessions.userId })
        .from(guestSessions)
        .orderBy(guestSessions.userId),
    ).toEqual(remaining.map(({ id }) => ({ userId: id })));
  },
);

it("retains accounts and guests with another live session during cleanup", async ({ db }) => {
  await db
    .insert(appUsers)
    .values([{ id: "account", clerkUserId: "clerk-account" }, { id: "guest" }]);
  await db.insert(guestSessions).values([
    { userId: "account", tokenHash: "account-expired", expiresAt: new Date(0) },
    { userId: "guest", tokenHash: "guest-expired", expiresAt: new Date(0) },
    { userId: "guest", tokenHash: "guest-live", expiresAt: new Date("2999-01-01") },
  ]);

  expect(await removeExpiredGuestBatch(db, async () => true)).toEqual({
    removed: 0,
    nextCursor: null,
  });
  expect(await db.select().from(appUsers)).toHaveLength(2);
  expect(await db.select().from(guestSessions)).toHaveLength(3);
});
