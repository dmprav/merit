import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { changeWorkspaceContact } from "@merit/contacts/server";
import type { Database } from "@merit/db";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

import { noContactGrantWork } from "./contact-test";

const details = { name: "Sam", email: "sam@example.test", affiliation: "" };

const create = async (db: Database) => {
  const address = { workspaceSlug, contactId: randomUUID() };
  const created = await changeWorkspaceContact(
    db,
    actor,
    { ...address, action: "create", details },
    noContactGrantWork,
  );
  assert(created.status === "ok");
  return address;
};

it("serializes competing archival and rejects the stale revision", async ({ db, locks }) => {
  const address = await create(db);

  const archive = (connection: Database) =>
    changeWorkspaceContact(
      connection,
      actor,
      {
        ...address,
        action: "archive",
        expectedContactRevision: 0,
      },
      noContactGrantWork,
    );

  expect(await locks.race(archive, archive)).toEqual({ status: "conflict" });
});

it("serializes competing Tier 1 contact updates and applies the later details", async ({
  db,
  locks,
}) => {
  const address = await create(db);

  const update = (connection: Database, name: string) =>
    changeWorkspaceContact(
      connection,
      actor,
      {
        ...address,
        action: "update",
        details: { ...details, name },
      },
      noContactGrantWork,
    );

  const result = await locks.race(
    (tx) => update(tx, "Updated contact"),
    (second) => update(second, "Later contact"),
  );
  expect(result).toMatchObject({ status: "ok", contact: { name: "Later contact", revision: 2 } });
});
