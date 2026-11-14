import { assert, expect } from "vite-plus/test";

import { seedExampleReviewer, seedExampleRounds } from "@merit/grantmaking/testing";
import { createReviewerService } from "@merit/reviews/server";
import { databaseTest as it } from "@merit/test-support/database";

it("seeds usable reviewer work once and preserves drafts, submissions and revoked permissions", async ({
  db,
  database,
}) => {
  await seedExampleRounds(db);
  await seedExampleReviewer(db);
  const actor = { userId: "local-reviewer" };
  const service = createReviewerService({
    database: (operation) => operation(db),
    verifiedEmails: async () => ["reviewer@example.test"],
    send: async () => {},
    reviewerUrl: (_slug, id) => id,
    managerUrl: (slug, id) => `${slug}/${id}`,
  });
  const list = await service.list(actor, { workspaceSlug: "alder" });
  assert(list.status === "ok");
  expect(list.value).toHaveLength(2);
  expect(list.value).toMatchObject([{ status: "invited" }, { status: "invited" }]);
  const assignmentId = list.value[0]!.id;
  expect(
    await service.respond(actor, {
      assignmentId,
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      action: "accept",
      note: "",
    }),
  ).toMatchObject({ status: "ok" });
  const page = await service.read(actor, { assignmentId });
  assert(page.status === "ok" && page.value.draft && page.value.material);
  expect(page.value.criteria?.length).toBeGreaterThan(0);
  expect(
    await service.saveDraft(actor, {
      assignmentId,
      commandId: crypto.randomUUID(),
      expectedDraftRevision: 0,
      draft: {
        ...page.value.draft.content,
        position: "Decline",
        reasoning: "Preserve my independent local assessment.",
      },
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await service.submit(actor, {
      assignmentId,
      commandId: crypto.randomUUID(),
      expectedDraftRevision: 1,
    }),
  ).toMatchObject({ status: "ok" });
  const submitted = await service.read(actor, { assignmentId });
  await seedExampleReviewer(db);
  expect(await service.read(actor, { assignmentId })).toEqual(submitted);
  await database.client.query("DELETE FROM memberships WHERE user_id = 'local-reviewer'");
  await database.client.query("UPDATE app_users SET active = false WHERE id = 'local-reviewer'");
  await seedExampleReviewer(db);
  expect(
    (await database.client.query("SELECT * FROM memberships WHERE user_id = 'local-reviewer'"))
      .rows,
  ).toEqual([]);
  expect(
    (await database.client.query("SELECT active FROM app_users WHERE id = 'local-reviewer'")).rows,
  ).toEqual([{ active: false }]);
  expect(
    (
      await database.client.query(
        "SELECT id FROM review_assignments WHERE email = 'reviewer@example.test'",
      )
    ).rows,
  ).toHaveLength(2);
});
