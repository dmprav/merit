import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";
import { seedExampleReviewer, seedExampleRounds } from "@merit/grantmaking/testing";
import { createReviewerService } from "@merit/reviews/server";
import { databaseTest as it } from "@merit/test-support/database";

const actor = { userId: "local-reviewer" };

const seededReviewer = async (db: Database) => {
  await seedExampleRounds(db);
  await seedExampleReviewer(db);
  const service = createReviewerService({
    database: (operation) => operation(db),
    send: async () => {},
    reviewerUrl: (_slug, id) => id,
    managerUrl: (slug, id) => `${slug}/${id}`,
  });
  const list = await service.list(actor, { workspaceSlug: "alder" });
  assert(list.status === "ok", "Expected the seeded reviewer's assignments");
  return { service, assignments: list.value };
};

const assignmentsQuery = "SELECT id FROM review_assignments WHERE email = 'reviewer@example.test'";

it("seeds two invitations the local reviewer can accept and assess", async ({ db }) => {
  const { service, assignments } = await seededReviewer(db);

  expect(assignments).toMatchObject([{ status: "invited" }, { status: "invited" }]);
  const assignmentId = assignments[0]!.id;
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
  assert(page.status === "ok");
  expect(page.value.material).not.toBeNull();
  expect(page.value.criteria?.length).toBeGreaterThan(0);
  expect(page.value.draft).not.toBeNull();
});

it("reseeding leaves the reviewer's submitted work unchanged and adds no assignments", async ({
  db,
  database,
}) => {
  const { service, assignments } = await seededReviewer(db);
  const assignmentId = assignments[0]!.id;
  await service.respond(actor, {
    assignmentId,
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    action: "accept",
    note: "",
  });
  const accepted = await service.read(actor, { assignmentId });
  assert(accepted.status === "ok" && accepted.value.draft, "Expected an accepted assignment");
  const saved = await service.saveDraft(actor, {
    assignmentId,
    commandId: crypto.randomUUID(),
    expectedDraftRevision: 0,
    draft: {
      ...accepted.value.draft.content,
      position: "Decline",
      reasoning: "Preserve my independent local assessment.",
    },
  });
  assert(saved.status === "ok", "Expected the draft to save");
  const submittedResult = await service.submit(actor, {
    assignmentId,
    commandId: crypto.randomUUID(),
    expectedDraftRevision: 1,
  });
  assert(submittedResult.status === "ok", "Expected the assessment to submit");
  const submitted = await service.read(actor, { assignmentId });

  await seedExampleReviewer(db);

  expect(await service.read(actor, { assignmentId })).toEqual(submitted);
  expect((await database.client.query(assignmentsQuery)).rows).toHaveLength(2);
});

it("reseeding does not restore a removed membership or a deactivated account", async ({
  db,
  database,
}) => {
  await seededReviewer(db);
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
  expect((await database.client.query(assignmentsQuery)).rows).toHaveLength(2);
});
