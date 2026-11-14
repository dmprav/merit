import { sql } from "drizzle-orm";
import { expect } from "vite-plus/test";

import type { Database } from "@merit/db";

import type { OrganizationService } from "../src/api/service";
import { createOrganizationService, getWorkspace } from "../src/server/index";
import { actor, workspaceTest as it, workspaceSlug } from "./workspace-test";

const serviceFor = (db: Database) =>
  createOrganizationService({
    revokeReviewAccess: async () => {},
    database: (operation) => operation(db),
    isOperator: () => true,
    verifiedEmails: async () => [],
    sendInvitation: async () => {},
    invitationUrl: (token) => `https://merit.example/invitations/${token}`,
  });

const queries: [string, (service: OrganizationService, db: Database) => Promise<unknown>][] = [
  ["access requests", (service) => service.accessRequests(actor)],
  ["organization list", (service) => service.list(actor)],
  ["organization details", (service) => service.read(actor, { organizationId: "alder" })],
  ["invitation", (service) => service.invitation(actor, { token: "a".repeat(64) })],
  ["team", (service) => service.team(actor, { workspaceSlug })],
  ["team overview", (service) => service.teamOverview(actor, { workspaceSlug })],
  ["member page", (service) => service.membersPage(actor, { workspaceSlug })],
  ["invitation page", (service) => service.invitationsPage(actor, { workspaceSlug })],
  ["team history", (service) => service.teamHistoryPage(actor, { workspaceSlug })],
  [
    "team event",
    (service) =>
      service.teamEvent(actor, { workspaceSlug, eventId: "60000000-0000-4000-8000-000000000001" }),
  ],
  ["workspace page", (service) => service.workspacesPage(actor, {})],
  ["workspace list", (service) => service.workspaces(actor)],
  ["workspace lookup", (_service, db) => getWorkspace(db, actor, workspaceSlug)],
];

for (const [name, query] of queries) {
  it(`PostgreSQL rejects writes during an independent ${name} query`, async ({ db }) => {
    // Inject an accidental write into the transaction opened by the actual query.
    const transaction: Database["transaction"] = (read, options) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`update organizations set name = name where false`);
        return read(tx);
      }, options);

    const guarded = new Proxy(db, {
      get(target, property, receiver): unknown {
        return property === "transaction" ? transaction : Reflect.get(target, property, receiver);
      },
    });

    await expect(query(serviceFor(guarded), guarded)).rejects.toMatchObject({
      cause: { code: "25006" },
    });
  });
}

it("organization queries see caller-owned changes without committing them", async ({ db }) => {
  const rollback = new Error("Roll back the caller's work");
  await expect(
    db.transaction(async (tx) => {
      const service = serviceFor(tx);
      expect(
        await service.rename(actor, { organizationId: "alder", name: "Uncommitted name" }),
      ).toEqual({ status: "ok", value: null });
      expect(await service.read(actor, { organizationId: "alder" })).toMatchObject({
        status: "ok",
        value: { name: "Uncommitted name" },
      });
      expect(await service.team(actor, { workspaceSlug })).toMatchObject({
        status: "ok",
        value: { organization: { name: "Uncommitted name" } },
      });
      expect(await getWorkspace(tx, actor, workspaceSlug)).toMatchObject({
        name: "Uncommitted name",
      });
      throw rollback;
    }),
  ).rejects.toBe(rollback);

  expect(await getWorkspace(db, actor, workspaceSlug)).toMatchObject({ name: "Alder Foundation" });
});
