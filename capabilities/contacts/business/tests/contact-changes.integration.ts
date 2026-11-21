import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

import type { ContactCommand } from "../src/api/commands";
import type { ContactGrantWork } from "../src/server/grant-work";
import {
  changeWorkspaceContact,
  getContactDetails,
  listContactSummaries,
  listWorkspaceContacts,
} from "../src/server/index";

const grantWork: ContactGrantWork = {
  applicationTitles: async () => new Map<string, string[]>(),
  outstandingRequests: async () => [],
};
const details = { name: "Sam", email: "sam@example.test", affiliation: "Review panel" };

const setup = async (db: Database) => {
  const address = { workspaceSlug, contactId: randomUUID() };

  const change = (input: ContactCommand) => changeWorkspaceContact(db, actor, input, grantWork);

  const created = await change({ ...address, action: "create", details });
  assert(created.status === "ok");

  const read = () => getContactDetails(db, actor, address);

  return { address, change, created, read };
};

it("returns the current contact for creation retries and unchanged saves", async ({ db }) => {
  const { address, change, created, read } = await setup(db);
  const initial = await read();

  expect(await change({ ...address, action: "create", details })).toEqual(created);
  expect(await change({ ...address, action: "update", details })).toEqual(created);
  expect(await read()).toEqual(initial);

  const updatedDetails = { ...details, name: "Samuel" };
  const updated = await change({
    ...address,
    action: "update",
    details: updatedDetails,
  });
  expect(updated).toMatchObject({ status: "ok", contact: { name: "Samuel", revision: 1 } });
  const saved = await read();

  expect(await change({ ...address, action: "create", details })).toEqual(updated);
  expect(
    await change({
      ...address,
      action: "update",
      details: updatedDetails,
    }),
  ).toEqual(updated);
  expect(
    await change({
      ...address,
      action: "update",
      details: { ...updatedDetails, affiliation: "Updated affiliation" },
    }),
  ).toEqual({
    status: "ok",
    contact: {
      ...created.contact,
      ...updatedDetails,
      affiliation: "Updated affiliation",
      archived: false,
      revision: 2,
    },
  });
  expect(await read()).not.toEqual(saved);
});

it.for([
  { field: "name", value: "Samuel" },
  { field: "email", value: "samuel@example.test" },
  { field: "affiliation", value: "Community group" },
] as const)(
  "saves the current $field and advances the contact revision",
  async ({ field, value }, { db }) => {
    const { address, change, created } = await setup(db);
    const next = { ...details, [field]: value };

    expect(await change({ ...address, action: "update", details: next })).toEqual({
      status: "ok",
      contact: { ...created.contact, ...next, revision: 1 },
    });
  },
);

it.for([
  { action: "archive", revision: 1, archived: true },
  { action: "restore", revision: 2, archived: false },
] as const)(
  "does not advance the revision when $action is repeated at the current revision",
  async ({ action, revision, archived }, { db }) => {
    const { address, change, read } = await setup(db);
    const archivedResult = await change({
      ...address,
      action: "archive",
      expectedContactRevision: 0,
    });
    expect(archivedResult).toMatchObject({
      status: "ok",
      contact: { ...details, archived: true, revision: 1 },
    });
    const result = await change({ ...address, action, expectedContactRevision: 1 });
    expect(result).toMatchObject({ status: "ok", contact: { ...details, archived, revision } });
    const saved = await read();

    expect(await change({ ...address, action, expectedContactRevision: revision })).toEqual(result);
    expect(await read()).toEqual(saved);
  },
);

it("preserves archive state and details across lifecycle changes and rejects a stale one", async ({
  db,
}) => {
  const { address, change, read } = await setup(db);
  expect(await change({ ...address, action: "archive", expectedContactRevision: 0 })).toMatchObject(
    { status: "ok", contact: { ...details, archived: true, revision: 1 } },
  );
  const archived = await read();

  expect(await change({ ...address, action: "restore", expectedContactRevision: 0 })).toEqual({
    status: "conflict",
  });
  expect(await read()).toEqual(archived);

  const renamed = { ...details, name: "Samuel" };
  expect(await change({ ...address, action: "update", details: renamed })).toMatchObject({
    status: "ok",
    contact: { ...renamed, archived: true, revision: 2 },
  });
  expect(await change({ ...address, action: "restore", expectedContactRevision: 2 })).toMatchObject(
    { status: "ok", contact: { ...renamed, archived: false, revision: 3 } },
  );
});

it("lists contact summaries without history, by archive state and page", async ({ db }) => {
  const archived = await setup(db);
  await archived.change({ ...archived.address, action: "archive", expectedContactRevision: 0 });
  const active = [(await setup(db)).address.contactId, (await setup(db)).address.contactId].sort();

  const ids = async (input: { archived?: boolean; after?: string; limit?: number }) => {
    const result = await listContactSummaries(db, actor, { workspaceSlug, ...input });
    assert(result.status === "ok");

    return result;
  };

  expect((await ids({ archived: true })).contacts.map((contact) => contact.contactId)).toEqual([
    archived.address.contactId,
  ]);
  expect((await ids({ archived: false })).contacts.map((contact) => contact.contactId)).toEqual(
    active,
  );

  const first = await ids({ archived: false, limit: 1 });
  expect(first.contacts[0]).not.toHaveProperty("history");
  expect(first.contacts.map((contact) => contact.contactId)).toEqual([active[0]]);
  expect(first.nextCursor).toBe(active[0]);
  const rest = await ids({ archived: false, limit: 1, after: first.nextCursor! });
  expect(rest.contacts.map((contact) => contact.contactId)).toEqual([active[1]]);
  expect(rest.nextCursor).toBeNull();
});

it("conceals contacts from other workspaces and from administrators without program management", async ({
  db,
  database,
}) => {
  const { address, change, read } = await setup(db);
  const before = await read();
  const birch = { userId: "birch-manager" };
  const guessed = { workspaceSlug: "birch", contactId: address.contactId };

  expect(await getContactDetails(db, birch, address)).toEqual({ status: "not_found" });
  expect(await getContactDetails(db, birch, guessed)).toEqual({ status: "not_found" });
  expect(await listWorkspaceContacts(db, birch, { workspaceSlug }, grantWork)).toEqual({
    status: "not_found",
  });

  const archive = (contactId: string) =>
    changeWorkspaceContact(
      db,
      birch,
      { workspaceSlug: "birch", contactId, action: "archive", expectedContactRevision: 0 },
      grantWork,
    );

  expect(await archive(address.contactId)).toEqual(await archive(randomUUID()));

  await database.client.query(
    "UPDATE memberships SET role = 'member', administration = 'owner' WHERE user_id = 'dana'",
  );
  expect(await change({ ...address, action: "archive", expectedContactRevision: 0 })).toEqual({
    status: "not_found",
  });
  expect(await listWorkspaceContacts(db, actor, { workspaceSlug }, grantWork)).toEqual({
    status: "not_found",
  });
  expect(await listContactSummaries(db, actor, { workspaceSlug })).toEqual({
    status: "not_found",
  });

  await database.client.query(
    "UPDATE memberships SET role = 'program_manager', administration = 'none' WHERE user_id = 'dana'",
  );
  expect(await read()).toEqual(before);
});

it("stores only the current profile across creation, edits, archive, and restore", async ({
  db,
  database,
}) => {
  const { address, change } = await setup(db);
  for (const command of [
    { action: "update", details: { ...details, name: "Samuel" } },
    { action: "archive", expectedContactRevision: 1 },
    { action: "restore", expectedContactRevision: 2 },
  ] as const) {
    expect(await change({ ...address, ...command })).toMatchObject({ status: "ok" });
  }
  const events = await database.client.query(
    "SELECT id FROM audit_events WHERE target_type = 'contact' AND target_id = $1",
    [address.contactId],
  );
  expect(events.rows).toEqual([]);
});
