import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import {
  changeWorkspaceContact,
  getContactDetails,
  listContactSummaries,
  listContactChanges,
} from "@merit/contacts/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";

it("changes contact lifecycle atomically without overwriting details or accepting stale revisions", async ({
  db,
}) => {
  const contactId = randomUUID();

  const change = (input: Parameters<typeof changeWorkspaceContact>[2]) =>
    changeWorkspaceContact(db, actor, input, fundingRoundContactUsage);

  const created = await change({
    workspaceSlug,
    contactId,
    action: "create",
    details: { name: "Original", email: "", affiliation: "" },
  });
  assert(created.status === "ok");
  await change({
    workspaceSlug,
    contactId,
    action: "update",
    expectedContactRevision: 0,
    details: { name: "Current", email: "person@example.test", affiliation: "Group" },
  });
  expect(
    await change({ workspaceSlug, contactId, action: "archive", expectedContactRevision: 0 }),
  ).toEqual({ status: "conflict" });
  expect(
    await change({ workspaceSlug, contactId, action: "archive", expectedContactRevision: 1 }),
  ).toMatchObject({
    status: "ok",
    contact: { name: "Current", email: "person@example.test", archived: true, revision: 2 },
  });
  expect(
    await change({ workspaceSlug, contactId, action: "restore", expectedContactRevision: 2 }),
  ).toMatchObject({ status: "ok", contact: { name: "Current", archived: false, revision: 3 } });
  const history = await listContactChanges(db, actor, { workspaceSlug, contactId, limit: 2 });
  assert(history.status === "ok");
  expect(history.entries).toHaveLength(2);
  expect(history.nextRevision).toBe(1);
  const rest = await listContactChanges(db, actor, {
    workspaceSlug,
    contactId,
    limit: 2,
    afterRevision: 1,
  });
  assert(rest.status === "ok");
  expect(rest.entries.map((entry) => entry.revision)).toEqual([2, 3]);
  expect(rest.nextRevision).toBeNull();
  expect(
    (await getContactDetails(db, { userId: "birch-manager" }, { workspaceSlug, contactId })).status,
  ).toBe("not_found");
  const page = await listContactSummaries(db, actor, { workspaceSlug, limit: 1 });
  assert(page.status === "ok");
  expect(page.contacts).toHaveLength(1);
  expect(page.contacts[0]).not.toHaveProperty("history");
});
