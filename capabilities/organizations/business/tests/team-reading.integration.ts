import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { recordAuditEvent } from "@merit/audit/server/record";
import type { Database } from "@merit/db";
import { createInlineOrganizationService } from "@merit/organizations/server/testing";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

const serviceFor = (db: Database) =>
  createInlineOrganizationService({
    revokeReviewAccess: async () => {},
    database: async (operation) => operation(db),
    isOperator: async () => false,
    verifiedEmails: async () => [],
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.test").href,
    sendInvitation: async () => {},
  });

const administer = (db: Database, userId: string, administration: "none" | "administrator") =>
  db.execute(
    sql`update memberships set administration = ${administration} where organization_id = 'alder' and user_id = ${userId}`,
  );

const invite = async (db: Database, email: string, issuer = actor) => {
  const result = await serviceFor(db).inviteMember(issuer, {
    workspaceSlug,
    requestId: randomUUID(),
    email,
    administration: "none",
    role: "program_manager",
  });
  assert(result.status === "ok");
};

it("restricts invitations, team history and event content to current administrators", async ({
  db,
}) => {
  const service = serviceFor(db);
  expect((await service.teamOverview(actor, { workspaceSlug })).status).toBe("ok");
  expect(await service.invitationsPage(actor, { workspaceSlug })).toEqual({ status: "forbidden" });
  expect(await service.teamHistoryPage(actor, { workspaceSlug })).toEqual({ status: "forbidden" });

  await administer(db, actor.userId, "administrator");
  await invite(db, "person@example.test");
  const history = await service.teamHistoryPage(actor, { workspaceSlug });
  assert(history.status === "ok" && history.value.entries[0]);
  const eventId = history.value.entries[0].eventId;
  expect((await service.teamEvent(actor, { workspaceSlug, eventId })).status).toBe("ok");

  await administer(db, actor.userId, "none");
  expect(await service.invitationsPage(actor, { workspaceSlug })).toEqual({ status: "forbidden" });
  expect(await service.teamHistoryPage(actor, { workspaceSlug })).toEqual({ status: "forbidden" });
  expect(await service.teamEvent(actor, { workspaceSlug, eventId })).toEqual({
    status: "forbidden",
  });
});

it("pages pending invitations and narrows them to one issuer", async ({ db, database }) => {
  const colleague = { userId: "rae" };
  await database.client.query("INSERT INTO app_users (id, name) VALUES ('rae', 'Rae Quinn')");
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role, administration) VALUES ('alder', 'rae', 'member', 'administrator')",
  );
  await administer(db, actor.userId, "administrator");
  for (const email of ["one@example.test", "two@example.test", "three@example.test"]) {
    await invite(db, email);
  }
  await invite(db, "colleague@example.test", colleague);
  const service = serviceFor(db);

  const first = await service.invitationsPage(actor, {
    workspaceSlug,
    limit: 2,
    issuedBy: actor.userId,
  });
  assert(first.status === "ok" && first.value.nextCursor);
  const rest = await service.invitationsPage(actor, {
    workspaceSlug,
    limit: 2,
    issuedBy: actor.userId,
    after: first.value.nextCursor,
  });
  assert(rest.status === "ok");
  expect(rest.value.nextCursor).toBeNull();

  const issued = [...first.value.invitations, ...rest.value.invitations];
  expect(issued.map((invitation) => invitation.email).sort()).toEqual([
    "one@example.test",
    "three@example.test",
    "two@example.test",
  ]);
  expect(issued.every((invitation) => invitation.invitedBy === actor.userId)).toBe(true);
  const all = await service.invitationsPage(actor, { workspaceSlug });
  assert(all.status === "ok");
  expect(all.value.invitations).toHaveLength(4);
});

it("pages team history newest first without other capabilities' or workspaces' events", async ({
  db,
}) => {
  await administer(db, actor.userId, "administrator");
  for (const email of ["first@example.test", "second@example.test", "third@example.test"]) {
    await invite(db, email);
  }
  await db.transaction(async (tx) => {
    // Later events outside team subjects or in another workspace stay out of this history.
    await recordAuditEvent(tx, {
      organizationId: "alder",
      actor: { userId: actor.userId, provenance: { interface: "web" } },
      action: "round.renamed",
      target: { type: "round", id: randomUUID(), revision: 1 },
    });
    await recordAuditEvent(tx, {
      organizationId: "birch",
      actor: { userId: "birch-manager", provenance: { interface: "web" } },
      action: "organization.renamed",
      target: { type: "organization", id: "birch", revision: null },
    });
  });
  const service = serviceFor(db);

  const first = await service.teamHistoryPage(actor, { workspaceSlug, limit: 2 });
  assert(first.status === "ok" && first.value.nextCursor);
  const rest = await service.teamHistoryPage(actor, {
    workspaceSlug,
    limit: 2,
    after: first.value.nextCursor,
  });
  assert(rest.status === "ok");
  expect(rest.value.nextCursor).toBeNull();

  expect(
    [...first.value.entries, ...rest.value.entries].map((entry) => ({
      action: entry.action,
      details: entry.details,
    })),
  ).toMatchObject([
    { action: "team_invitation.issued", details: { email: "third@example.test" } },
    { action: "team_invitation.issued", details: { email: "second@example.test" } },
    { action: "team_invitation.issued", details: { email: "first@example.test" } },
  ]);
});

it("reads a team event's content in bounded chunks and conceals events outside team subjects", async ({
  db,
  database,
}) => {
  await administer(db, actor.userId, "administrator");
  await invite(db, "person@example.test");
  const service = serviceFor(db);
  const history = await service.teamHistoryPage(actor, { workspaceSlug });
  assert(history.status === "ok" && history.value.entries[0]);
  const { eventId, details } = history.value.entries[0];

  let content = "";
  let offset: number | null = 0;
  while (offset !== null) {
    const chunk = await service.teamEvent(actor, { workspaceSlug, eventId, offset, length: 10 });
    assert(chunk.status === "ok");
    expect(chunk.value.content.length).toBeLessThanOrEqual(10);
    content += chunk.value.content;
    offset = chunk.value.nextOffset;
  }
  expect(JSON.parse(content)).toEqual(details);

  await db.transaction(async (tx) => {
    await recordAuditEvent(tx, {
      organizationId: "alder",
      actor: { userId: actor.userId, provenance: { interface: "web" } },
      action: "round.renamed",
      target: { type: "round", id: randomUUID(), revision: 1 },
      details: { after: { name: "Private round" } },
    });
    await recordAuditEvent(tx, {
      organizationId: "birch",
      actor: { userId: "birch-manager", provenance: { interface: "web" } },
      action: "organization.renamed",
      target: { type: "organization", id: "birch", revision: null },
    });
  });
  const { rows } = await database.client.query<{ id: string }>(
    "SELECT id FROM audit_events WHERE action IN ('round.renamed', 'organization.renamed')",
  );
  expect(rows).toHaveLength(2);
  for (const { id } of rows) {
    expect(await service.teamEvent(actor, { workspaceSlug, eventId: id })).toEqual({
      status: "not_found",
    });
  }
});
