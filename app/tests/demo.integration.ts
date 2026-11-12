import { eq } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { createFundingApplication } from "@merit/applications/server";
import { removeDemoAudit } from "@merit/audit/server/demo";
import { recordAuditEvent } from "@merit/audit/server/record";
import { appUsers, guestSessions } from "@merit/auth/schema";
import {
  ensureInactiveUser,
  createGuestSession,
  removeExpiredGuestBatch,
} from "@merit/auth/server";
import { listWorkspaceContacts } from "@merit/contacts/server";
import { removeDemoContacts } from "@merit/contacts/server/demo";
import { withDatabase, type Database } from "@merit/db";
import {
  getFundingRoundPage,
  getFundingApplicationPage,
  listFundingRounds,
} from "@merit/grantmaking/server";
import {
  exampleSeedVersion,
  fundingExampleAuthor,
  fundingExampleIds,
  seedFundingExample,
  removeDemoFunding,
} from "@merit/grantmaking/server/demo";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { organizations } from "@merit/organizations/schema";
import { getWorkspace } from "@merit/organizations/server";
import {
  allowDemoEntry,
  canRemoveGuest,
  readDemoWorkspace,
  startDemoWorkspace,
  removeExpiredDemos,
} from "@merit/organizations/server/demo";
import { seedWorkspace } from "@merit/organizations/testing";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { databaseTest } from "@merit/test-support/database";

const test = databaseTest;
test("requires demo lifetime and seed metadata at the database boundary", async ({ db }) => {
  for (const metadata of [
    { demoExpiresAt: new Date(), demoSeedVersion: null },
    { demoExpiresAt: null, demoSeedVersion: 1 },
    { demoExpiresAt: new Date(), demoSeedVersion: 0 },
  ]) {
    await expect(
      db.insert(organizations).values({
        id: crypto.randomUUID(),
        slug: `demo-${crypto.randomUUID()}`,
        name: "Invalid demo",
        kind: "demo",
        ...metadata,
      }),
    ).rejects.toThrow();
  }
});

const seed: Parameters<typeof startDemoWorkspace>[4] = async (db, workspace, userId) =>
  seedFundingExample(db, workspace.id, userId, await ensureInactiveUser(db, fundingExampleAuthor));

const start = (
  db: Database,
  userId: string,
  input = { fresh: false } as { fresh: boolean; resetWorkspaceId?: string },
) => startDemoWorkspace(db, { userId }, input, exampleSeedVersion, seed);

const users = (db: Database) =>
  db.insert(appUsers).values([
    { id: "alice", name: "Alice" },
    { id: "bob", name: "Bob" },
  ]);

const remove = (db: Database) =>
  removeExpiredDemos(db, async (tx, id) => {
    await removeDemoAudit(tx, id);
    await removeDemoFunding(tx, id);
    await removeDemoContacts(tx, id);
  });

test("creates independent complete examples and resumes concurrent starts", async ({
  db,
  database,
}) => {
  await users(db);

  const [first, resumed, other] = await Promise.all(
    ["alice", "alice", "bob"].map((id) =>
      withDatabase(database.connectionString, (connection) => start(connection, id)),
    ),
  );

  assert.isDefined(first);
  assert.isDefined(resumed);
  assert.isDefined(other);
  expect(first.status).toBe("ready");
  if (first.status !== "ready" || resumed.status !== "ready" || other.status !== "ready") {
    throw new Error("seed failed");
  }
  expect(resumed.workspace.id).toBe(first.workspace.id);
  expect(other.workspace.id).not.toBe(first.workspace.id);
  expect(await getWorkspace(db, { userId: "bob" }, first.workspace.slug)).toBeNull();

  const listed = await listFundingRounds(db, { userId: "alice" }, first.workspace.slug);
  assert(listed.status === "ok");
  const rounds = listed.rounds;
  const page = await getFundingRoundPage(
    db,
    { userId: "alice" },
    { workspaceSlug: first.workspace.slug, publicId: rounds[0]!.publicId, kind: "round" },
  );

  expect(page?.round.applications).toHaveLength(3);

  const ids = await fundingExampleIds(first.workspace.id);
  const revised = page!.round.applications.find((item) => item.id === ids.applications.A3)!;
  const detail = await getFundingApplicationPage(
    db,
    { userId: "alice" },
    { workspaceSlug: first.workspace.slug, publicId: revised.id },
  );

  expect(detail?.intake.history).toHaveLength(1);
  expect(detail?.intake.history[0]?.actor).toBe("Dana Reed");
  expect(detail?.application.reviews.requests).toHaveLength(2);

  const contacts = await listWorkspaceContacts(
    db,
    { userId: "alice" },
    { workspaceSlug: first.workspace.slug },
    fundingRoundContactUsage,
  );

  expect(contacts.status).toBe("ok");
  expect(
    await getFundingApplicationPage(
      db,
      { userId: "bob" },
      { workspaceSlug: first.workspace.slug, publicId: revised.id },
    ),
  ).toBeNull();
});

test("reset is scoped and retryable, and old workspace requests cannot write", async ({
  db,
  database,
}) => {
  await seedWorkspace(db, {
    organization: { id: "real", slug: "real", name: "Real work" },
    user: { id: "alice", name: "Alice" },
    membership: { role: "program_manager" },
  });
  const first = await start(db, "alice");

  if (first.status !== "ready") {
    throw new Error("seed failed");
  }

  // Reset throttling measures elapsed time since creation, without delaying this test.
  await db
    .update(organizations)
    .set({ demoExpiresAt: new Date(Date.now() + 7 * 86400000 - 20000) })
    .where(eq(organizations.id, first.workspace.id));
  const input = { fresh: true, resetWorkspaceId: first.workspace.id };
  const [reset, retry] = await Promise.all(
    [1, 2].map(() =>
      withDatabase(database.connectionString, (connection) => start(connection, "alice", input)),
    ),
  );

  assert.isDefined(reset);
  assert.isDefined(retry);
  if (reset.status !== "ready" || retry.status !== "ready") {
    throw new Error("reset failed");
  }
  expect(reset.workspace.id).not.toBe(first.workspace.id);
  expect(retry.workspace.id).toBe(reset.workspace.id);
  expect(await getWorkspace(db, { userId: "alice" }, "real")).toBeDefined();
  expect(await getWorkspace(db, { userId: "alice" }, first.workspace.slug)).toBeNull();
  expect(
    await createFundingApplication(
      db,
      { userId: "alice" },
      {
        workspaceSlug: first.workspace.slug,
        publicId: "k7m2p9x4n6rt",
        requestId: crypto.randomUUID(),
        title: "Old tab",
      },
    ),
  ).toEqual({ status: "not_found" });

  await remove(db);

  expect(
    await db.select().from(organizations).where(eq(organizations.id, first.workspace.id)),
  ).toHaveLength(0);
  expect(await getWorkspace(db, { userId: "alice" }, "real")).toBeDefined();
  expect((await db.select().from(appUsers).where(eq(appUsers.id, "alice")))[0]?.active).toBe(true);
});

test("expiry denies normal reads before cleanup and requires an explicit fresh start", async ({
  db,
}) => {
  await users(db);
  const first = await start(db, "alice");

  if (first.status !== "ready") {
    throw new Error("seed failed");
  }

  await db
    .update(organizations)
    .set({ demoExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(organizations.id, first.workspace.id));

  expect(await readDemoWorkspace(db, { userId: "alice" })).toEqual({ status: "expired" });
  expect(await start(db, "alice")).toEqual({ status: "expired" });
  expect(await listFundingRounds(db, { userId: "alice" }, first.workspace.slug)).toEqual({
    status: "not_found",
  });

  const fresh = await start(db, "alice", { fresh: true });

  expect(fresh.status).toBe("ready");
});

test("failed seeding rolls back workspace and memberships", async ({ db }) => {
  await users(db);

  await expect(
    startDemoWorkspace(db, { userId: "alice" }, { fresh: false }, 1, async () => {
      throw new Error("seed failed");
    }),
  ).rejects.toThrow("seed failed");
  expect(await readDemoWorkspace(db, { userId: "alice" })).toEqual({ status: "empty" });
  expect(await db.select().from(organizations)).toHaveLength(0);
});

test("bounds provisioning across requests without storing network addresses", async ({ db }) => {
  for (let index = 0; index < 40; index++) {
    expect(await allowDemoEntry(db, "192.0.2.1")).toBe(true);
  }

  expect(await allowDemoEntry(db, "192.0.2.1")).toBe(false);
  expect(await allowDemoEntry(db, "192.0.2.2")).toBe(true);
});

test("cleanup removes expired guest data while preserving account and sample authors", async ({
  db,
  database,
}) => {
  const guest = await createGuestSession(db, fundingExampleAuthor.name);
  const first = await start(db, guest.userId);

  if (first.status !== "ready") {
    throw new Error("seed failed");
  }

  const ids = await fundingExampleIds(first.workspace.id);
  const applicationId = ids.applications.A3;
  assert.isDefined(applicationId);
  const address = { workspaceSlug: first.workspace.slug, publicId: applicationId };
  const page = await getFundingApplicationPage(db, { userId: guest.userId }, address);
  assert(page);
  expect(
    await saveFundingRecommendation(
      db,
      { userId: guest.userId },
      {
        ...address,
        expectedRevision: page.recommendationVersion,
        expectedApplicationVersion: page.application.version,
        recommendation: {
          position: "Fund",
          allocation: { currency: "EUR", minorUnits: "1000" },
          reasoning: "Recorded in the disposable demo.",
        },
      },
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });
  expect(
    (
      await database.client.query("SELECT id FROM audit_events WHERE organization_id=$1", [
        first.workspace.id,
      ])
    ).rows,
  ).toHaveLength(1);

  await db
    .update(organizations)
    .set({ demoExpiresAt: new Date(0) })
    .where(eq(organizations.id, first.workspace.id));
  await db
    .update(guestSessions)
    .set({ expiresAt: new Date(0) })
    .where(eq(guestSessions.userId, guest.userId));
  await remove(db);
  await removeExpiredGuestBatch(db, canRemoveGuest);

  expect(
    (
      await database.client.query("SELECT id FROM audit_events WHERE organization_id=$1", [
        first.workspace.id,
      ])
    ).rows,
  ).toHaveLength(0);

  expect(await db.select().from(appUsers).where(eq(appUsers.id, guest.userId))).toHaveLength(0);
  expect(
    await db.select().from(appUsers).where(eq(appUsers.id, "merit-example-author")),
  ).toHaveLength(1);
});
