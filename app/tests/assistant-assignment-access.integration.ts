import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { withDatabase, type DatabaseRunner } from "@merit/db";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { seedExampleReviewer, seedExampleRounds } from "@merit/grantmaking/testing";
import { createAssistantStore } from "@merit/organizations/server/assistant";
import { createInlineReviewerService } from "@merit/reviews/testing";
import { databaseTest } from "@merit/test-support/database";

const reviewer = { userId: "local-reviewer" };
const manager = { userId: "local-workspace-manager" };
const workspaceSlug = "alder";

const reviews = (database: DatabaseRunner) =>
  createInlineReviewerService({
    database,
    send: async () => {},
    reviewerUrl: (_slug, id) => id,
    managerUrl: (_slug, id) => id,
  });

const it = databaseTest
  .extend("runtime", { scope: "file" }, async ({ database }) => database.createRuntimeConnection())
  .extend("scenario", async ({ db, runtime }) => {
    await seedExampleRounds(db);
    await seedExampleReviewer(db);

    const run: DatabaseRunner = (operation) => withDatabase(runtime, operation);

    const store = createAssistantStore(run);
    await store.setConsent(manager, workspaceSlug, true);
    const service = reviews(run);
    const ids = await fundingExampleIds(workspaceSlug);
    const address = { workspaceSlug, publicId: ids.applications.A1! };
    const list = await service.forApplication(manager, address);
    assert(list.status === "ok");
    const assignment = list.value.find((row) => row.email === "reviewer@example.test");
    assert(assignment?.status === "invited");
    const assignmentId = assignment.id;

    const chat = (evidence: boolean) =>
      store.create(reviewer, workspaceSlug, {
        status: "awaiting_approval",
        state: { dependencies: [{ kind: "assignment", assignmentId, active: true, evidence }] },
      });

    const manage = (action: "cancel" | "reinstate" | "clear_conflict", expectedRevision: number) =>
      service.manage(manager, {
        ...address,
        assignmentId,
        action,
        expectedRevision,
        commandId: randomUUID(),
        note: "Participation reviewed by the manager",
      });

    const respond = (
      action: "accept" | "report_conflict",
      expectedRevision: number,
      runner: DatabaseRunner = run,
    ) =>
      reviews(runner).respond(reviewer, {
        workspaceSlug,
        assignmentId,
        action,
        expectedRevision,
        commandId: randomUUID(),
        note: action === "report_conflict" ? "I work with the applicant" : "",
      });

    return { store, chat, manage, respond, service, assignmentId };
  });

it("preserves an invitation chat when the reviewer accepts", async ({ scenario: s }) => {
  const chat = await s.chat(false);
  expect(await s.respond("accept", 0)).toMatchObject({
    status: "ok",
    value: { status: "accepted" },
  });
  expect(await s.store.read(reviewer, workspaceSlug, chat.id)).toEqual(chat);
});

it("closes an invitation chat even when the invitation is reinstated before reopening", async ({
  scenario: s,
}) => {
  const chat = await s.chat(false);
  expect(await s.manage("cancel", 0)).toMatchObject({
    status: "ok",
    value: { status: "cancelled" },
  });
  expect(await s.manage("reinstate", 1)).toMatchObject({
    status: "ok",
    value: { status: "invited" },
  });
  expect(await s.store.read(reviewer, workspaceSlug, chat.id)).toMatchObject({
    status: "unavailable",
  });
});

it("keeps an evidence chat unavailable after a conflict is cleared and the reviewer accepts again", async ({
  scenario: s,
}) => {
  expect(await s.respond("accept", 0)).toMatchObject({ status: "ok" });
  const chat = await s.chat(true);
  expect(await s.respond("report_conflict", 1)).toMatchObject({
    status: "ok",
    value: { status: "conflict" },
  });
  expect(await s.manage("clear_conflict", 2)).toMatchObject({
    status: "ok",
    value: { status: "invited" },
  });
  expect(await s.respond("accept", 3)).toMatchObject({
    status: "ok",
    value: { status: "accepted" },
  });
  expect(await s.store.read(reviewer, workspaceSlug, chat.id)).toMatchObject({
    status: "unavailable",
  });
});

it("commits an authorized conflict report while closing the chat that used assignment evidence", async ({
  scenario: s,
}) => {
  expect(await s.respond("accept", 0)).toMatchObject({ status: "ok" });
  const chat = await s.chat(true);
  const saved = await s.store.runLocked(
    reviewer,
    workspaceSlug,
    chat.id,
    chat.revision,
    async (tx) => {
      const report = await s.respond("report_conflict", 1, (operation) => operation(tx));
      assert(report.status === "ok");
      return { status: "completed", state: {} };
    },
  );
  expect(saved).toMatchObject({ status: "unavailable" });
  expect(await s.store.read(reviewer, workspaceSlug, chat.id)).toEqual(saved);
  expect(
    await s.service.read(reviewer, { workspaceSlug, assignmentId: s.assignmentId }),
  ).toMatchObject({
    status: "ok",
    value: { assignment: { status: "conflict", revision: 2 } },
  });
});
