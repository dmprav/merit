import { sql } from "drizzle-orm";
import { assert, describe, expect } from "vite-plus/test";

import { removeDemoAudit } from "@merit/audit/server/demo";
import { readWorkspaceActivity, readAuditHistory } from "@merit/audit/server/read";
import { recordAuditEvent } from "@merit/audit/server/record";
import { workspaceTest as test } from "@merit/organizations/testing/workspace";

const scope = {
  organizationId: "alder",
  targetTypes: ["round", "application", "assessment", "recommendation"],
};

const event = {
  organizationId: "alder",
  actor: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" as const } },
  action: "recommendation.recorded",
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
      record(tx, { action: "recommendation.recorded", target: { ...event.target, revision: 6 } }),
    );

    const first = await readWorkspaceActivity(db, { ...scope, organizationId: "alder", limit: 4 });
    assert(first.status === "ok" && first.nextCursor !== null);
    expect(first.events).toHaveLength(4);
    expect(first.events[0]).toMatchObject({ targetRevision: 6, actorName: "Dana Reed" });
    const second = await readWorkspaceActivity(db, {
      ...scope,
      organizationId: "alder",
      limit: 4,
      after: first.nextCursor,
    });
    assert(second.status === "ok");
    expect(second.nextCursor).toBeNull();
    // Later pages omit the filter choices the first page carries.
    expect(first.people).toHaveLength(1);
    expect(second.people).toEqual([]);

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
      await readWorkspaceActivity(db, { ...scope, organizationId: "alder", limit: 1 }),
    ).toMatchObject({ status: "ok", nextCursor: null, events: [{ action: event.action }] });
    expect(await readWorkspaceActivity(db, { ...scope, organizationId: "birch" })).toEqual({
      status: "ok",
      events: [],
      people: [],
      nextCursor: null,
    });
  });

  test("scopes trusted reads to the caller's authorized workspace and record types", async ({
    db,
  }) => {
    await db.transaction(async (tx) => {
      await record(tx);
      await record(tx, {
        action: "membership.access_changed",
        target: { type: "membership", id: "dana", revision: null },
      });
      await record(tx, {
        organizationId: "birch",
        actor: { ...event.actor, userId: "birch-manager" },
      });
    });
    expect(
      await readWorkspaceActivity(db, { organizationId: "alder", targetTypes: ["recommendation"] }),
    ).toMatchObject({ events: [{ action: "recommendation.recorded" }] });
    expect(
      await readWorkspaceActivity(db, { organizationId: "birch", targetTypes: ["membership"] }),
    ).toMatchObject({ events: [], people: [] });
  });

  test("filters by recorded person and by historical round, and lists everyone with recorded activity", async ({
    db,
    database,
  }) => {
    await database.client.query("INSERT INTO app_users (id, name) VALUES ('rae', 'Rae Quinn')");
    await db.transaction(async (tx) => {
      await record(tx, {
        action: "application.created",
        target: { type: "application", id: "app1", revision: 0 },
      });
      await record(tx, {
        action: "assessment.recorded",
        target: { type: "assessment", id: "a1", revision: 1 },
        context: { roundId: "round1" },
      });
      await record(tx, {
        actor: { userId: "rae", name: "Rae Quinn", provenance: { interface: "web" } },
        action: "round.budget_changed",
        target: { type: "round", id: "round1", revision: 1 },
        context: { roundId: "round1" },
      });
    });
    await db.transaction((tx) =>
      record(tx, {
        actor: {
          userId: "rae",
          name: null,
          provenance: { interface: "mcp", clientId: "assistant" },
        },
        action: "round.created",
        target: { type: "round", id: "round1", revision: 0 },
        context: { roundId: "round1" },
      }),
    );

    const read = (input: Partial<Parameters<typeof readWorkspaceActivity>[1]>) =>
      readWorkspaceActivity(db, { ...scope, organizationId: "alder", ...input });

    const actions = async (input: Parameters<typeof read>[0]) => {
      const result = await read(input);
      assert(result.status === "ok");
      return result.events.map((entry) => entry.action).sort();
    };

    expect(await actions({ actorUserId: "rae" })).toEqual([
      "round.budget_changed",
      "round.created",
    ]);
    expect(await actions({ actorUserId: "dana" })).toEqual([
      "application.created",
      "assessment.recorded",
    ]);
    expect(await actions({ roundId: "round1" })).toEqual([
      "assessment.recorded",
      "round.budget_changed",
      "round.created",
    ]);
    expect(await actions({ roundId: "missing" })).toEqual([]);
    expect(await actions({ actorUserId: "dana", roundId: "round1" })).toEqual([
      "assessment.recorded",
    ]);

    // The latest recorded name identifies a person; an unnamed event never hides a known name.
    const result = await read({});
    assert(result.status === "ok");
    expect(result.people).toEqual([
      { userId: "dana", name: "Dana Reed" },
      { userId: "rae", name: "Rae Quinn" },
    ]);
  });

  test("preserves historical time and unknown attribution without inventing provenance", async ({
    db,
    database,
  }) => {
    const recordedAt = new Date("2020-01-01T00:00:00Z");
    await db.transaction((tx) =>
      record(tx, {
        actor: { userId: "dana", name: null, provenance: null },
        recordedAt,
        target: { ...event.target, name: "Historical proposal" },
        context: { roundId: "historical-round", applicationId: "historical-application" },
        details: { reason: "Recorded evidence" },
      }),
    );
    const page = await readWorkspaceActivity(db, scope);
    assert(page.status === "ok");
    expect(page.events).toMatchObject([
      {
        actorName: null,
        provenance: null,
        recordedAt,
        targetName: "Historical proposal",
        roundId: "historical-round",
        applicationId: "historical-application",
      },
    ]);
    expect(page.events[0]).not.toHaveProperty("details");
    expect(
      (await database.client.query("SELECT format_version, details FROM audit_events")).rows,
    ).toEqual([{ format_version: 1, details: { reason: "Recorded evidence" } }]);
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

    const result = await readWorkspaceActivity(db, { ...scope, organizationId: "alder" });
    assert(result.status === "ok");
    expect(result.events).toMatchObject([
      { actorName: "Dana Reed", provenance: { interface: "mcp", clientId: "verified-client" } },
    ]);
    expect(
      await readWorkspaceActivity(db, { ...scope, organizationId: "alder", after: "not-a-cursor" }),
    ).toEqual({ status: "invalid" });
  });
});

test("pages subject histories through timestamp ties and keeps subject, assignment and tenant scopes", async ({
  db,
}) => {
  const at = new Date("2026-11-01T10:00:00Z");
  await db.transaction(async (tx) => {
    for (let revision = 0; revision < 23; revision++) {
      await recordAuditEvent(tx, {
        ...event,
        target: { ...event.target, revision },
        recordedAt: at,
        context: { assignmentId: "assignment-a" },
        details: { revision },
      });
    }
    await recordAuditEvent(tx, {
      ...event,
      target: { ...event.target, id: "other" },
      recordedAt: at,
    });
    await recordAuditEvent(tx, {
      ...event,
      action: "contact.updated",
      target: { type: "contact", id: event.target.id, revision: 1 },
      recordedAt: at,
    });
  });
  const input = {
    organizationId: "alder",
    targetTypes: ["recommendation"],
    targetId: event.target.id,
  };
  const first = await readAuditHistory(db, input);
  expect(first.entries).toHaveLength(20);
  assert(first.nextCursor);
  const rest = await readAuditHistory(db, { ...input, after: first.nextCursor });
  expect(rest.entries).toHaveLength(3);
  expect(rest.nextCursor).toBeNull();
  expect(new Set([...first.entries, ...rest.entries].map((row) => row.id)).size).toBe(23);
  expect(await readAuditHistory(db, { ...input, organizationId: "birch" })).toEqual({
    entries: [],
    nextCursor: null,
  });
  expect(await readAuditHistory(db, { ...input, assignmentId: "assignment-b" })).toEqual({
    entries: [],
    nextCursor: null,
  });
  expect(
    (await readAuditHistory(db, { ...input, assignmentId: "assignment-a", limit: 1 })).entries,
  ).toHaveLength(1);
  expect(await readAuditHistory(db, { ...input, action: "recommendation.missing" })).toEqual({
    entries: [],
    nextCursor: null,
  });
  await expect(readAuditHistory(db, { ...input, after: "invalid" })).rejects.toThrow();
  await expect(readAuditHistory(db, { ...input, limit: 51 })).rejects.toThrow();
});
