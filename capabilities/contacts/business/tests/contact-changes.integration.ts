import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

import type { ContactCommand } from "../src/api/commands";
import type { ContactGrantWork } from "../src/server/grant-work";
import {
  changeWorkspaceContact,
  getContactDetails,
  listContactChanges,
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

  const read = async () => ({
    profile: await getContactDetails(db, actor, address),
    history: await listContactChanges(db, actor, address),
  });

  return { address, change, created, read };
};

it("returns the current contact for creation retries and unchanged saves without adding history", async ({
  db,
}) => {
  const { address, change, created, read } = await setup(db);
  const initial = await read();

  expect(await change({ ...address, action: "create", details })).toEqual(created);
  expect(
    await change({ ...address, action: "update", expectedContactRevision: 0, details }),
  ).toEqual(created);
  expect(await read()).toEqual(initial);

  const updatedDetails = { ...details, name: "Samuel" };
  const updated = await change({
    ...address,
    action: "update",
    expectedContactRevision: 0,
    details: updatedDetails,
  });
  expect(updated).toMatchObject({ status: "ok", contact: { name: "Samuel", revision: 1 } });
  const saved = await read();

  expect(await change({ ...address, action: "create", details })).toEqual(updated);
  expect(
    await change({
      ...address,
      action: "update",
      expectedContactRevision: 1,
      details: updatedDetails,
    }),
  ).toEqual(updated);
  expect(
    await change({
      ...address,
      action: "update",
      expectedContactRevision: 0,
      details: updatedDetails,
    }),
  ).toEqual({ status: "conflict" });
  expect(await read()).toEqual(saved);
});

it.for([
  { field: "name", value: "Samuel" },
  { field: "email", value: "samuel@example.test" },
  { field: "affiliation", value: "Community group" },
] as const)(
  "records a change to $field with its before and after profile and actor",
  async ({ field, value }, { db }) => {
    const { address, change, created } = await setup(db);
    const next = { ...details, [field]: value };

    expect(
      await change({ ...address, action: "update", expectedContactRevision: 0, details: next }),
    ).toEqual({
      status: "ok",
      contact: { ...created.contact, ...next, revision: 1 },
    });
    const history = await listContactChanges(db, actor, address);
    assert(history.status === "ok");

    expect(history.entries.toReversed()).toMatchObject([
      {
        revision: 0,
        actorUserId: actor.userId,
        provenance: { interface: "web" },
        before: null,
        after: { ...details, archived: false },
      },
      {
        revision: 1,
        actorUserId: actor.userId,
        provenance: { interface: "web" },
        before: { ...details, archived: false },
        after: { ...next, archived: false },
      },
    ]);
  },
);

it.for([
  { action: "archive", revision: 1, archived: true },
  { action: "restore", revision: 2, archived: false },
] as const)(
  "does not advance the revision or history when $action is repeated at the current revision",
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
  expect(
    await change({ ...address, action: "update", expectedContactRevision: 1, details: renamed }),
  ).toMatchObject({ status: "ok", contact: { ...renamed, archived: true, revision: 2 } });
  expect(await change({ ...address, action: "restore", expectedContactRevision: 2 })).toMatchObject(
    { status: "ok", contact: { ...renamed, archived: false, revision: 3 } },
  );
});

it("pages contact history newest first and summaries without history", async ({ db }) => {
  const { address, change } = await setup(db);
  await change({ ...address, action: "archive", expectedContactRevision: 0 });
  await change({ ...address, action: "restore", expectedContactRevision: 1 });
  await change({ ...address, action: "archive", expectedContactRevision: 2 });

  const first = await listContactChanges(db, actor, { ...address, limit: 2 });
  assert(first.status === "ok");
  expect(first.entries.map((entry) => entry.revision)).toEqual([3, 2]);
  assert(first.nextCursor);
  const rest = await listContactChanges(db, actor, {
    ...address,
    limit: 2,
    after: first.nextCursor,
  });
  assert(rest.status === "ok");
  expect(rest.entries.map((entry) => entry.revision)).toEqual([1, 0]);
  expect(rest.nextCursor).toBeNull();

  await setup(db);
  const summaries = await listContactSummaries(db, actor, { workspaceSlug, limit: 1 });
  assert(summaries.status === "ok");
  expect(summaries.contacts).toHaveLength(1);
  expect(summaries.contacts[0]).not.toHaveProperty("history");
  expect(summaries.nextCursor).toBe(summaries.contacts[0]?.contactId);
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
  expect(await listContactChanges(db, birch, guessed)).toEqual({ status: "not_found" });

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

it.for(["create", "update"] as const)(
  "rolls back contact %s when its history cannot be recorded",
  async (action, { db, database }) => {
    const address = { workspaceSlug, contactId: randomUUID() };
    if (action === "update") {
      const created = await changeWorkspaceContact(
        db,
        actor,
        { ...address, action: "create", details },
        grantWork,
      );
      assert(created.status === "ok");
    }
    const before = await getContactDetails(db, actor, address);
    const history = await listContactChanges(db, actor, address);
    const request: ContactCommand =
      action === "create"
        ? { ...address, action, details }
        : {
            ...address,
            action,
            expectedContactRevision: 0,
            details: { ...details, name: "Samuel" },
          };

    await database.client.query(
      "ALTER TABLE audit_events ADD CONSTRAINT reject_contact_history CHECK (false) NOT VALID",
    );
    try {
      await expect(changeWorkspaceContact(db, actor, request, grantWork)).rejects.toMatchObject({
        cause: { code: "23514" },
      });
      expect(await getContactDetails(db, actor, address)).toEqual(before);
      expect(await listContactChanges(db, actor, address)).toEqual(history);
    } finally {
      await database.client.query(
        "ALTER TABLE audit_events DROP CONSTRAINT reject_contact_history",
      );
    }
  },
);
