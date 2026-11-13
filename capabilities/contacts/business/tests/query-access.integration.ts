import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

import type { ContactService } from "../src/api/service";
import type { ContactGrantWork } from "../src/server/grant-work";
import {
  changeWorkspaceContact,
  createContactService,
  getContactDetails,
  listWorkspaceContacts,
} from "../src/server/index";

const grantWork: ContactGrantWork = {
  applicationTitles: async () => new Map<string, string[]>(),
  outstandingRequests: async () => [],
};
const contactId = "60000000-0000-4000-8000-000000000001";
const queries: [string, (service: ContactService) => Promise<unknown>][] = [
  ["contact directory", (service) => service.listContacts(actor, { workspaceSlug })],
  ["contact summaries", (service) => service.listContactSummaries(actor, { workspaceSlug })],
  ["contact details", (service) => service.getContact(actor, { workspaceSlug, contactId })],
  ["contact history", (service) => service.contactHistory(actor, { workspaceSlug, contactId })],
];

for (const [name, query] of queries) {
  it(`PostgreSQL rejects writes during an independent ${name} query`, async ({ db }) => {
    // Inject an accidental persistence write into the transaction used by the real query.
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
    const service = createContactService({
      database: (operation) => operation(guarded),
      grantWork,
    });

    await expect(query(service)).rejects.toMatchObject({ cause: { code: "25006" } });
  });
}

it("contact queries see caller-owned changes without committing them", async ({ db }) => {
  const id = randomUUID();
  const rollback = new Error("Roll back the caller's work");

  await expect(
    db.transaction(async (tx) => {
      const created = await changeWorkspaceContact(
        tx,
        actor,
        {
          workspaceSlug,
          contactId: id,
          action: "create",
          details: { name: "Uncommitted contact", email: "", affiliation: "" },
        },
        grantWork,
      );
      assert(created.status === "ok");

      expect(await getContactDetails(tx, actor, { workspaceSlug, contactId: id })).toMatchObject({
        status: "ok",
        contact: { name: "Uncommitted contact" },
      });
      const directory = await listWorkspaceContacts(tx, actor, { workspaceSlug }, grantWork);
      assert(directory.status === "ok");
      expect(directory.contacts.find((contact) => contact.id === id)).toMatchObject({
        name: "Uncommitted contact",
      });
      expect(directory.contacts.find((contact) => contact.id === id)).not.toHaveProperty("history");
      throw rollback;
    }),
  ).rejects.toBe(rollback);

  expect(await getContactDetails(db, actor, { workspaceSlug, contactId: id })).toEqual({
    status: "not_found",
  });
});
