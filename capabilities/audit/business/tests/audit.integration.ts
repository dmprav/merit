import { sql } from "drizzle-orm";
import { expect } from "vite-plus/test";

import { removeDemoAudit } from "@merit/audit/server/demo";
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
