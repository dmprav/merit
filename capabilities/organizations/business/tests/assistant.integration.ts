import { and, eq, sql } from "drizzle-orm";
import { expect } from "vite-plus/test";

import { withDatabase } from "@merit/db";

import { createAssistantStore } from "../src/server/assistant";
import { memberships, organizations } from "../src/server/persistence/membership-schema";
import { readWorkspace, writeWorkspace } from "../src/server/persistence/tenant";
import { actor, workspaceTest, workspaceSlug } from "./workspace-test";

const admin = { userId: "birch-manager" };
const it = workspaceTest
  .extend("runtimeUrl", { scope: "file" }, async ({ database }) =>
    database.createRuntimeConnection(),
  )
  .extend("store", async ({ runtimeUrl }) =>
    createAssistantStore((op) => withDatabase(runtimeUrl, op)),
  );

it("permanently invalidates only conversations which used a removed role", async ({
  db,
  store,
}) => {
  await store.setConsent(admin, "birch", true);
  const used = await store.create(admin, "birch", {
    status: "awaiting_approval",
    state: { dependencies: [{ kind: "grants" }] },
  });
  const empty = await store.create(admin, "birch");
  const member = eq(memberships.userId, admin.userId);
  await db.update(memberships).set({ role: "reviewer" }).where(member);
  await db.update(memberships).set({ role: "program_manager" }).where(member);
  expect(await store.read(admin, "birch", used.id)).toMatchObject({
    status: "unavailable",
    revision: 1,
  });
  expect(await store.read(admin, "birch", empty.id)).toMatchObject({ status: "idle" });
  expect(await store.save(admin, "birch", used.id, 0, { status: "running", state: {} })).toBeNull();
  expect(await store.save(admin, "birch", used.id, 1, { status: "running", state: {} })).toBeNull();
});

it("requires administrator consent for the specific workspace", async ({
  db,
  store,
  runtimeUrl,
}) => {
  expect(await store.getConsent(actor, workspaceSlug)).toBe(false);
  await expect(store.create(actor, workspaceSlug)).rejects.toMatchObject({
    code: "consent_required",
  });
  await expect(store.setConsent(actor, workspaceSlug, true)).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(store.setConsent(admin, workspaceSlug, true)).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(
    withDatabase(runtimeUrl, (runtime) =>
      writeWorkspace(runtime, actor.userId, workspaceSlug, (tx) =>
        tx.execute(sql`insert into assistant_consents (organization_id) values ('alder')`),
      ),
    ),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
  await db
    .update(memberships)
    .set({ administration: "administrator" })
    .where(eq(memberships.userId, actor.userId));
  expect(await store.setConsent(actor, workspaceSlug, true)).toEqual({ enabled: true, ending: [] });
  expect(await store.getConsent(actor, workspaceSlug)).toBe(true);
  expect(await store.getConsent(admin, "birch")).toBe(false);
  expect(await store.setConsent(actor, workspaceSlug, false)).toEqual({
    enabled: false,
    ending: [],
  });
});

it("isolates chat content and worker discovery by workspace, owner and membership lifetime", async ({
  db,
  store,
  runtimeUrl,
}) => {
  await db
    .insert(memberships)
    .values({ organizationId: "birch", userId: actor.userId, role: "reviewer" });
  await store.setConsent(admin, "birch", true);
  const chat = await store.create(actor, "birch", {
    status: "running",
    state: { question: "Confidential" },
  });
  expect(await store.running()).toEqual([
    { id: chat.id, revision: 0, userId: actor.userId, workspaceSlug: "birch" },
  ]);
  expect(await store.running(1, chat.id)).toEqual([]);
  expect(await store.list(admin, "birch")).toEqual([]);
  expect(await store.read(actor, workspaceSlug, chat.id)).toBeNull();
  expect(await store.remove(admin, "birch", chat.id)).toBe(false);
  const raw = await withDatabase(runtimeUrl, (runtime) =>
    readWorkspace(runtime, admin.userId, "birch", (tx) =>
      tx.execute(sql`select * from assistant_conversations`),
    ),
  );
  expect(raw.rows).toEqual([]);
  await db.delete(memberships).where(eq(memberships.role, "reviewer"));
  await db
    .insert(memberships)
    .values({ organizationId: "birch", userId: actor.userId, role: "reviewer" });
  expect(await store.running()).toEqual([]);
  expect(await store.read(actor, "birch", chat.id)).toBeNull();
});

it("tells only an administrator which running chats of their workspace consent withdrawal ends", async ({
  db,
  store,
  runtimeUrl,
}) => {
  await db
    .insert(memberships)
    .values({ organizationId: "birch", userId: actor.userId, role: "reviewer" });
  await store.setConsent(admin, "birch", true);
  const chat = await store.create(actor, "birch", { status: "running", state: {} });
  await store.create(actor, "birch", { status: "completed", state: {} });

  const listed = (userId: string, slug: string) =>
    withDatabase(runtimeUrl, (runtime) =>
      readWorkspace(runtime, userId, slug, async (tx) =>
        (
          await tx.execute<{ id: string }>(
            sql`select merit_workspace_running_assistant_conversations() as id`,
          )
        ).rows.map((row) => row.id),
      ),
    );

  // A member who is not an administrator learns nothing, even of their own chat.
  expect(await listed(actor.userId, "birch")).toEqual([]);
  // An administrator of another workspace learns nothing about this one.
  await db
    .update(memberships)
    .set({ administration: "administrator" })
    .where(and(eq(memberships.userId, actor.userId), eq(memberships.organizationId, "alder")));
  expect(await listed(actor.userId, workspaceSlug)).toEqual([]);
  expect(await listed(admin.userId, "birch")).toEqual([chat.id]);

  await expect(store.setConsent(actor, "birch", false)).rejects.toMatchObject({
    code: "forbidden",
  });
  expect(await store.setConsent(admin, "birch", false)).toEqual({
    enabled: false,
    ending: [chat.id],
  });
});

it("commits one competing worker, rolls back failed commands, and fences stale or deleted work", async ({
  store,
  db,
}) => {
  await store.setConsent(admin, "birch", true);
  const chat = await store.create(admin, "birch", { status: "running", state: { actions: [] } });
  const attempts = await Promise.all(
    [1, 2].map((n) =>
      store.runLocked(admin, "birch", chat.id, 0, async (tx) => {
        await tx
          .update(organizations)
          .set({ name: `Committed ${n}` })
          .where(eq(organizations.id, "birch"));
        return { status: "running", state: { actions: [n] } };
      }),
    ),
  );
  expect(attempts.filter(Boolean)).toHaveLength(1);
  const saved = await store.read(admin, "birch", chat.id);
  expect(saved).toMatchObject({ status: "running", revision: 1 });
  await expect(
    store.runLocked(admin, "birch", chat.id, 1, async (tx) => {
      await tx
        .update(organizations)
        .set({ name: "Rolled back" })
        .where(eq(organizations.id, "birch"));
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, "birch"));
  expect(organization?.name).toMatch(/^Committed [12]$/);
  expect(await store.read(admin, "birch", chat.id)).toEqual(saved);
  await store.setConsent(admin, "birch", false);
  expect(await store.running()).toEqual([]);
  expect(
    await store.runLocked(admin, "birch", chat.id, 1, async () => {
      throw Error("unexpected work");
    }),
  ).toBeNull();
  expect(
    await store.save(admin, "birch", chat.id, 1, { status: "stopped", state: { actions: [] } }),
  ).toMatchObject({ status: "stopped", revision: 2 });
  expect(await store.remove(admin, "birch", chat.id)).toBe(true);
  expect(await store.save(admin, "birch", chat.id, 2, { status: "stopped", state: {} })).toBeNull();
});
