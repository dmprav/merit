import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { createOrganizationService } from "@merit/organizations/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

it("paginates team directories and restricts invitation and audit detail reads to current administrators", async ({
  db,
}) => {
  const service = createOrganizationService({
    database: async (operation) => operation(db),
    isOperator: () => false,
    verifiedEmails: async () => [],
    invitationUrl: (token) => new URL(`/invitations/${token}`, "https://merit.test").href,
    sendInvitation: async () => {},
  });
  expect((await service.teamOverview(actor, { workspaceSlug })).status).toBe("ok");
  expect(await service.teamHistoryPage(actor, { workspaceSlug })).toEqual({ status: "forbidden" });
  expect(await service.invitationsPage(actor, { workspaceSlug })).toEqual({ status: "forbidden" });
  await db.execute(
    sql`update memberships set administration = 'administrator' where user_id = ${actor.userId}`,
  );
  for (let i = 0; i < 3; i++) {
    expect(
      (
        await service.inviteMember(actor, {
          workspaceSlug,
          requestId: randomUUID(),
          email: `person${i}@example.test`,
          administration: "none",
          role: "program_manager",
        })
      ).status,
    ).toBe("ok");
  }
  const first = await service.invitationsPage(actor, {
    workspaceSlug,
    limit: 2,
    issuedBy: actor.userId,
  });
  assert(first.status === "ok" && first.value.nextCursor);
  expect(first.value.invitations).toHaveLength(2);
  const last = await service.invitationsPage(actor, {
    workspaceSlug,
    limit: 2,
    issuedBy: actor.userId,
    after: first.value.nextCursor,
  });
  assert(last.status === "ok");
  expect(last.value.invitations).toHaveLength(1);
  expect(last.value.nextCursor).toBeNull();
  const history = await service.teamHistoryPage(actor, { workspaceSlug, limit: 1 });
  assert(history.status === "ok" && history.value.entries[0]);
  const team = await service.team(actor, { workspaceSlug });
  assert(team.status === "ok");
  expect(team.value).not.toHaveProperty("history");
  const eventId = history.value.entries[0].eventId;
  expect((await service.teamEvent(actor, { workspaceSlug, eventId, length: 10 })).status).toBe(
    "ok",
  );
  await db.execute(
    sql`update memberships set administration = 'none' where user_id = ${actor.userId}`,
  );
  expect(await service.teamEvent(actor, { workspaceSlug, eventId })).toEqual({
    status: "forbidden",
  });
});
