import { sql } from "drizzle-orm";
import { assert, describe, expect } from "vite-plus/test";

import { removeDemoAudit } from "@merit/audit/server/demo";
import { readWorkspaceActivity } from "@merit/audit/server/read";
import { recordAuditEvent } from "@merit/audit/server/record";
import { workspaceTest as test } from "@merit/organizations/testing/workspace";

const event = {
  organizationId: "alder",
  actor: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" as const } },
  action: "recommendation.saved",
  target: { type: "recommendation", id: "k7m2p9x4n6rt", revision: 1 },
};

test("retains recorded identity and verified MCP provenance after a profile rename", async ({
  db,
  database,
}) => {
  await db.transaction((tx) =>
    recordAuditEvent(tx, {
      ...event,
      actor: { ...event.actor, provenance: { interface: "mcp", clientId: "verified-client" } },
    }),
  );
  await database.client.query("UPDATE app_users SET name='Dana Newname' WHERE id='dana'");
  const { rows } = await database.client.query("SELECT * FROM audit_events");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    organization_id: event.organizationId,
    actor_user_id: event.actor.userId,
    actor_name: event.actor.name,
    provenance: { interface: "mcp", clientId: "verified-client" },
    action: event.action,
    target_type: event.target.type,
    target_id: event.target.id,
    target_revision: event.target.revision,
    id: expect.any(String) as unknown,
    recorded_at: expect.any(Date) as unknown,
  });
});

test("keeps events in the caller's transaction, including rollback", async ({ db, database }) => {
  const rollback = new Error("Caller rolled back");
  await expect(
    db.transaction(async (tx) => {
      await recordAuditEvent(tx, event);
      const result = await tx.execute(sql`select action from audit_events`);
      expect(result.rows).toEqual([{ action: event.action }]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect((await database.client.query("SELECT id FROM audit_events")).rows).toEqual([]);
});

test("protects recorded events while allowing only expired demo cleanup", async ({
  db,
  database,
}) => {
  await db.transaction((tx) => recordAuditEvent(tx, event));
  await expect(
    database.client.query("UPDATE audit_events SET actor_name='Changed'"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(database.client.query("DELETE FROM audit_events")).rejects.toMatchObject({
    code: "23514",
  });
  await db.transaction((tx) => removeDemoAudit(tx, "alder"));
  expect((await database.client.query("SELECT id FROM audit_events")).rows).toHaveLength(1);
  await database.client.query(
    "UPDATE organizations SET kind='demo', demo_expires_at=now()+interval '1 hour', demo_seed_version=1 WHERE id='alder'",
  );
  await db.transaction((tx) => removeDemoAudit(tx, "alder"));
  expect((await database.client.query("SELECT id FROM audit_events")).rows).toHaveLength(1);
  await database.client.query(
    "UPDATE organizations SET demo_expires_at=now()-interval '1 hour' WHERE id='alder'",
  );
  await db.transaction((tx) => removeDemoAudit(tx, "alder"));
  expect((await database.client.query("SELECT id FROM audit_events")).rows).toHaveLength(0);
});

const record = (
  tx: Parameters<typeof recordAuditEvent>[0],
  overrides: Partial<Parameters<typeof recordAuditEvent>[1]> = {},
) => recordAuditEvent(tx, { ...event, ...overrides });

describe("reading workspace activity", () => {
  const manager = { userId: "dana" };

  test("lists the workspace's events newest first and pages by a stable cursor, including ties", async ({
    db,
  }) => {
    // One transaction gives every event the same recorded time; the id breaks the tie.
    await db.transaction(async (tx) => {
      for (let revision = 1; revision <= 5; revision++) {
        await record(tx, { target: { ...event.target, revision } });
      }
    });
    await db.transaction((tx) =>
      record(tx, { action: "recommendation.saved", target: { ...event.target, revision: 6 } }),
    );

    const first = await readWorkspaceActivity(db, manager, { workspaceSlug: "alder", limit: 4 });
    assert(first.status === "ok" && first.nextCursor !== null);
    expect(first.events).toHaveLength(4);
    expect(first.events[0]).toMatchObject({ targetRevision: 6, actorName: "Dana Reed" });
    const second = await readWorkspaceActivity(db, manager, {
      workspaceSlug: "alder",
      limit: 4,
      after: first.nextCursor,
    });
    assert(second.status === "ok");
    expect(second.nextCursor).toBeNull();

    const all = [...first.events, ...second.events];
    expect(all).toHaveLength(6);
    expect(new Set(all.map((entry) => entry.id)).size).toBe(6);
    const ordered = [...all].sort(
      (left, right) =>
        right.recordedAt.getTime() - left.recordedAt.getTime() || (right.id < left.id ? -1 : 1),
    );
    expect(all.map((entry) => entry.id)).toEqual(ordered.map((entry) => entry.id));
  });

  test("returns a full final page without a cursor and nothing for a workspace without events", async ({
    db,
  }) => {
    await db.transaction((tx) => record(tx));

    expect(
      await readWorkspaceActivity(db, manager, { workspaceSlug: "alder", limit: 1 }),
    ).toMatchObject({ status: "ok", nextCursor: null, events: [{ action: event.action }] });
    expect(
      await readWorkspaceActivity(db, { userId: "birch-manager" }, { workspaceSlug: "birch" }),
    ).toEqual({ status: "ok", events: [], people: [], nextCursor: null });
  });

  test("shows only the requested workspace to its current program managers", async ({
    db,
    database,
  }) => {
    await db.transaction(async (tx) => {
      await record(tx);
      await record(tx, {
        organizationId: "birch",
        actor: { ...event.actor, userId: "birch-manager", name: "Birch manager" },
      });
    });
    await database.client.query(
      "INSERT INTO app_users (id, name) VALUES ('rae', 'Rae'), ('outsider', 'Outsider')",
    );
    await database.client.query(
      "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'rae', 'member')",
    );

    const read = (userId: string, workspaceSlug: string) =>
      readWorkspaceActivity(db, { userId }, { workspaceSlug });

    expect(await read("dana", "alder")).toMatchObject({
      status: "ok",
      events: [{ actorUserId: "dana" }],
    });
    expect(await read("birch-manager", "birch")).toMatchObject({
      status: "ok",
      events: [{ actorUserId: "birch-manager" }],
    });
    // A member without grant access can see the workspace but not its activity.
    expect(await read("rae", "alder")).toEqual({ status: "forbidden" });
    expect(await read("dana", "birch")).toEqual({ status: "not_found" });
    expect(await read("outsider", "alder")).toEqual({ status: "not_found" });
    expect(await read("dana", "missing")).toEqual({ status: "not_found" });

    // Access follows the current role, not the role that recorded the event.
    await database.client.query(
      "UPDATE memberships SET role='member' WHERE organization_id='alder' AND user_id='dana'",
    );
    expect(await read("dana", "alder")).toEqual({ status: "forbidden" });
  });

  test("filters by recorded person and by record, and lists everyone with recorded activity", async ({
    db,
    database,
  }) => {
    await database.client.query("INSERT INTO app_users (id, name) VALUES ('rae', 'Rae Quinn')");
    await db.transaction(async (tx) => {
      await record(tx, {
        action: "application.create",
        target: { type: "application", id: "app1", revision: 0 },
      });
      await record(tx, {
        action: "assessment.recorded",
        target: { type: "assessment", id: "a1", revision: 1 },
      });
      await record(tx, {
        actor: { userId: "rae", name: "Rae Quinn", provenance: { interface: "web" } },
        action: "round.budget",
        target: { type: "round", id: "round1", revision: 1 },
      });
    });
    await db.transaction((tx) =>
      record(tx, {
        actor: {
          userId: "rae",
          name: null,
          provenance: { interface: "mcp", clientId: "assistant" },
        },
        action: "round.create",
        target: { type: "round", id: "round1", revision: 0 },
      }),
    );

    const read = (input: Omit<Parameters<typeof readWorkspaceActivity>[2], "workspaceSlug">) =>
      readWorkspaceActivity(db, manager, { workspaceSlug: "alder", ...input });

    const actions = async (input: Parameters<typeof read>[0]) => {
      const result = await read(input);
      assert(result.status === "ok");
      return result.events.map((entry) => entry.action).sort();
    };

    expect(await actions({ actorUserId: "rae" })).toEqual(["round.budget", "round.create"]);
    expect(await actions({ actorUserId: "dana" })).toEqual([
      "application.create",
      "assessment.recorded",
    ]);
    expect(
      await actions({
        targets: [
          { type: "round", ids: ["round1"] },
          { type: "assessment", ids: ["a1", "other"] },
          { type: "application", ids: [] },
        ],
      }),
    ).toEqual(["assessment.recorded", "round.budget", "round.create"]);
    // An id only matches events of its own record type.
    expect(await actions({ targets: [{ type: "application", ids: ["round1", "a1"] }] })).toEqual(
      [],
    );
    expect(await actions({ targets: [] })).toEqual([]);
    expect(await actions({ targets: [{ type: "round", ids: [] }] })).toEqual([]);
    expect(
      await actions({ actorUserId: "rae", targets: [{ type: "assessment", ids: ["a1"] }] }),
    ).toEqual([]);

    // The latest recorded name identifies a person; an unnamed event never hides a known name.
    const result = await read({});
    assert(result.status === "ok");
    expect(result.people).toEqual([
      { userId: "dana", name: "Dana Reed" },
      { userId: "rae", name: "Rae Quinn" },
    ]);
  });

  test("keeps the recorded name and provenance after profile changes and rejects a malformed cursor", async ({
    db,
    database,
  }) => {
    await db.transaction((tx) =>
      record(tx, {
        actor: { ...event.actor, provenance: { interface: "mcp", clientId: "verified-client" } },
      }),
    );
    await database.client.query("UPDATE app_users SET name='Dana Newname' WHERE id='dana'");

    const result = await readWorkspaceActivity(db, manager, { workspaceSlug: "alder" });
    assert(result.status === "ok");
    expect(result.events).toMatchObject([
      { actorName: "Dana Reed", provenance: { interface: "mcp", clientId: "verified-client" } },
    ]);
    await expect(
      readWorkspaceActivity(db, manager, { workspaceSlug: "alder", after: "not-a-cursor" }),
    ).rejects.toThrow();
  });
});
