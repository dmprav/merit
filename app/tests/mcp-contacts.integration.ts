import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { getContactDetails, changeWorkspaceContact } from "@merit/contacts/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { actor } from "@merit/organizations/testing/workspace";

import { commandTest as it } from "./fixtures/mcp-command-test";

it("creates a contact with the supplied details", async ({ db, commands: { invoke } }) => {
  const contactId = randomUUID();
  const details = { name: "Sam", email: "sam@example.test", affiliation: "Review panel" };

  expect(await invoke("create_contact", { workspaceSlug: "alder", contactId, details })).toEqual({
    status: "ok",
    contact: { contactId, contactRevision: 0, ...details, archived: false },
  });
  expect(await getContactDetails(db, actor, { workspaceSlug: "alder", contactId })).toMatchObject({
    status: "ok",
    contact: { contactId, ...details },
  });
});

it.for(["update", "archive", "restore"] as const)(
  "%s changes only the intended contact fields at the supplied revision",
  async (action, { db, commands: { invoke, createContact } }) => {
    const contactId = await createContact();
    if (action === "restore") {
      const archived = await changeWorkspaceContact(
        db,
        actor,
        {
          workspaceSlug: "alder",
          contactId,
          action: "archive",
          expectedContactRevision: 0,
        },
        fundingRoundContactUsage,
      );
      assert(archived.status === "ok");
    }
    const expectedContactRevision = action === "restore" ? 1 : 0;
    const details = {
      name: action === "update" ? "Samuel" : "Sam",
      email: "sam@example.test",
      affiliation: "Review panel",
    };
    const args = {
      workspaceSlug: "alder",
      contactId,
      ...(action === "update" ? { details } : { expectedContactRevision }),
    };

    expect(await invoke(`${action}_contact`, args)).toEqual({
      status: "ok",
      contact: {
        contactId,
        contactRevision: expectedContactRevision + 1,
        ...details,
        archived: action === "archive",
      },
    });
    const saved = await getContactDetails(db, actor, { workspaceSlug: "alder", contactId });
    expect(saved).toMatchObject({
      status: "ok",
      contact: { ...details, archived: action === "archive" },
    });
  },
);

it("updates a contact with last-write-wins over concurrent edits", async ({
  db,
  commands: { invoke, createContact },
}) => {
  const contactId = await createContact();
  const details = {
    name: "Current name",
    email: "sam@example.test",
    affiliation: "Review panel",
  };
  const changed = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      contactId,
      action: "update",
      details,
    },
    fundingRoundContactUsage,
  );
  assert(changed.status === "ok");
  expect(
    await invoke("update_contact", {
      workspaceSlug: "alder",
      contactId,
      details: { ...details, name: "Latest name" },
    }),
  ).toMatchObject({ status: "ok", contact: { name: "Latest name", contactRevision: 2 } });

  expect(await getContactDetails(db, actor, { workspaceSlug: "alder", contactId })).toMatchObject({
    status: "ok",
    contact: { name: "Latest name", contactRevision: 2 },
  });
});

it("rejects archiving a contact with a stale revision without changing its state", async ({
  db,
  commands: { invoke, createContact },
}) => {
  const contactId = await createContact();
  const updated = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      contactId,
      action: "update",
      details: { name: "Current name", email: "sam@example.test", affiliation: "Review panel" },
    },
    fundingRoundContactUsage,
  );
  assert(updated.status === "ok");
  const latest = await getContactDetails(db, actor, { workspaceSlug: "alder", contactId });

  expect(
    await invoke("archive_contact", {
      workspaceSlug: "alder",
      contactId,
      expectedContactRevision: 0,
    }),
  ).toEqual({ status: "conflict" });
  expect(await getContactDetails(db, actor, { workspaceSlug: "alder", contactId })).toEqual(latest);
});
