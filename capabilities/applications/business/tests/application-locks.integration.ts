import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import {
  createFundingApplication,
  editFundingApplication,
  selectApplicationContact,
} from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { noContactGrantWork } from "@merit/contacts/testing";
import type { Database } from "@merit/db";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

import { applicationTest as it, noApplicationWork } from "./application-test";
import { readPersistedApplication } from "./persisted-application";

const create = (db: Database, publicId: string, requestId: string) =>
  createFundingApplication(db, actor, {
    workspaceSlug,
    publicId,
    requestId,
    title: "Community meals",
  });

const contact = async (db: Database) => {
  const created = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create",
      details: { name: "Sam", email: "sam@example.test", affiliation: "" },
    },
    noContactGrantWork,
  );
  assert(created.status === "ok");
  return created.contact.id;
};

it("keeps application creation retries serialized", async ({ rounds, locks }) => {
  const requestId = randomUUID();
  let publicId: string | undefined;
  const retry = await locks.race(
    async (tx) => {
      const result = await create(tx, rounds.pageInput.publicId, requestId);
      assert(result.status === "ok");
      publicId = result.publicId;
      return result;
    },
    (second) => create(second, rounds.pageInput.publicId, requestId),
  );
  expect(retry).toEqual({ status: "ok", publicId });
});

it("allows independent application creates and rejects a competing cross-round receipt", async ({
  db,
  database,
  rounds,
  locks,
}) => {
  const b = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Second round",
  });
  assert(b.status === "ok");
  const requestId = randomUUID();
  const commit = await locks.hold((tx) => create(tx, rounds.pageInput.publicId, requestId));
  expect(await create(locks.second, b.publicId, randomUUID())).toMatchObject({ status: "ok" });
  const competing = await locks.finishBlocked(create(locks.second, b.publicId, requestId), commit);
  expect(competing).toEqual({ status: "invalid", error: "application_deleted" });
  expect(
    (
      await database.client.query("SELECT id FROM application_cases WHERE round_id = $1", [
        b.publicId,
      ])
    ).rowCount,
  ).toBe(1);
});

it.for(["content", "contact"] as const)(
  "serializes competing %s edits and rejects the stale revision",
  async (kind, { db, applications, locks }) => {
    const address = await applications.createApplication("Community meals");
    const change =
      kind === "contact"
        ? {
            action: "save_content" as const,
            content: { title: "Community meals" },
            contactId: await contact(db),
          }
        : { action: "save_content" as const, content: { title: "Updated community meals" } };

    const edit = (connection: Database) =>
      editFundingApplication(
        connection,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change,
        },
        noApplicationWork,
      );

    expect(await locks.race(edit, edit)).toEqual({ status: "conflict" });
  },
);

it("serializes competing Tier 1 contact selections and applies the later choice", async ({
  db,
  applications,
  locks,
}) => {
  const address = await applications.createApplication("Community meals");
  const contactId = await contact(db);
  const result = await locks.race(
    (tx) => selectApplicationContact(tx, actor, { ...address, contactId }),
    (second) => selectApplicationContact(second, actor, { ...address, contactId: null }),
  );
  expect(result).toMatchObject({ status: "ok" });
  expect((await readPersistedApplication(db, address.publicId))?.application.contactId).toBeNull();
});
