import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import type { Database } from "@merit/db";
import {
  applicationAuditHistory,
  getFundingApplicationPage,
  roundBudgetHistory,
} from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";

const createRound = async (db: Database) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "History pages",
  });
  assert(round.status === "ok", "Could not create the funding-round fixture");
  return round.publicId;
};

const createApplication = async (db: Database, roundId: string, title: string) => {
  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: roundId,
    requestId: randomUUID(),
    title,
    applicant: "Neighbours",
    requested: "100",
    answers: [],
  });
  assert(application.status === "ok", "Could not create the application fixture");
  return application.publicId;
};

/** Records `count` detail changes after creation, leaving the application at revision `count`. */
const editDetails = async (db: Database, publicId: string, count: number) => {
  for (let revision = 0; revision < count; revision++) {
    const edited = await editFundingApplication(
      db,
      actor,
      {
        workspaceSlug,
        publicId,
        expectedRevision: revision,
        change: { action: "details", summary: `Update ${revision}` },
      },
      applicationWork,
    );
    assert(edited.status === "ok", "Could not record the application history fixture");
  }
};

/** Records budgets of 1000, 1001, … after creation, leaving the round at revision `count`. */
const changeBudgets = async (db: Database, roundId: string, count: number) => {
  for (let revision = 0; revision < count; revision++) {
    const edited = await editFundingRound(db, actor, {
      workspaceSlug,
      publicId: roundId,
      expectedRevision: revision,
      change: { section: "budget", amount: String(1000 + revision), reason: "Updated funding" },
    });
    assert(edited.status === "ok", "Could not record the budget history fixture");
  }
};

it("embeds the newest 20 application history entries and pages older ones newest first", async ({
  db,
}) => {
  const roundId = await createRound(db);
  const applicationId = await createApplication(db, roundId, "Local project");
  const sibling = await createApplication(db, roundId, "Sibling project");
  await editDetails(db, applicationId, 22);
  await editDetails(db, sibling, 2);

  const page = await getFundingApplicationPage(db, actor, {
    workspaceSlug,
    publicId: applicationId,
  });
  expect(page?.intake.history).toHaveLength(20);
  const input = { workspaceSlug, applicationId };
  const first = await applicationAuditHistory(db, actor, input);
  assert(first.status === "ok" && first.nextCursor);
  const older = await applicationAuditHistory(db, actor, { ...input, after: first.nextCursor });
  assert(older.status === "ok");

  expect(first.entries.map((entry) => entry.revision)).toEqual(
    Array.from({ length: 20 }, (_, index) => 22 - index),
  );
  expect(older.entries.map(({ revision, action }) => ({ revision, action }))).toEqual([
    { revision: 2, action: "application.summary_changed" },
    { revision: 1, action: "application.summary_changed" },
    { revision: 0, action: "application.created" },
  ]);
  expect(older.nextCursor).toBeNull();
});

it("pages a round's budget changes without its other events", async ({ db }) => {
  const roundId = await createRound(db);
  await changeBudgets(db, roundId, 3);

  const newest = await roundBudgetHistory(db, actor, { workspaceSlug, roundId, limit: 2 });
  assert(newest.status === "ok" && newest.nextCursor);
  const older = await roundBudgetHistory(db, actor, {
    workspaceSlug,
    roundId,
    after: newest.nextCursor,
  });
  assert(older.status === "ok");

  const toChange = ({ action, reason, before, after }: (typeof newest.entries)[number]) => ({
    action,
    reason,
    before: before?.minorUnits ?? null,
    after: after?.minorUnits ?? null,
  });

  expect(newest.entries.map(toChange)).toEqual([
    {
      action: "round.budget_changed",
      reason: "Updated funding",
      before: "100100",
      after: "100200",
    },
    {
      action: "round.budget_changed",
      reason: "Updated funding",
      before: "100000",
      after: "100100",
    },
  ]);
  expect(older.entries.map(toChange)).toEqual([
    { action: "round.budget_changed", reason: "Updated funding", before: null, after: "100000" },
  ]);
  expect(older.nextCursor).toBeNull();
});

it("hides application and budget histories outside the reader's workspace", async ({ db }) => {
  const roundId = await createRound(db);
  const applicationId = await createApplication(db, roundId, "Local project");
  await changeBudgets(db, roundId, 1);
  const outsider = { userId: "birch-manager" };

  expect(await applicationAuditHistory(db, outsider, { workspaceSlug, applicationId })).toEqual({
    status: "not_found",
  });
  expect(
    await applicationAuditHistory(db, actor, { workspaceSlug: "birch", applicationId }),
  ).toEqual({ status: "not_found" });
  expect(await roundBudgetHistory(db, outsider, { workspaceSlug, roundId })).toEqual({
    status: "not_found",
  });
  expect(await roundBudgetHistory(db, actor, { workspaceSlug: "birch", roundId })).toEqual({
    status: "not_found",
  });
});

it("rechecks current grant access before continuing an older history page", async ({
  db,
  database,
}) => {
  const roundId = await createRound(db);
  const applicationId = await createApplication(db, roundId, "Local project");
  await editDetails(db, applicationId, 20);
  await changeBudgets(db, roundId, 2);
  const application = { workspaceSlug, applicationId };
  const round = { workspaceSlug, roundId, limit: 1 };
  const applicationPage = await applicationAuditHistory(db, actor, application);
  const budgetPage = await roundBudgetHistory(db, actor, round);
  assert(applicationPage.status === "ok" && applicationPage.nextCursor);
  assert(budgetPage.status === "ok" && budgetPage.nextCursor);

  await database.client.query(
    "UPDATE memberships SET role = 'member' WHERE organization_id='alder' AND user_id='dana'",
  );

  expect(
    await applicationAuditHistory(db, actor, { ...application, after: applicationPage.nextCursor }),
  ).toEqual({ status: "not_found" });
  expect(await roundBudgetHistory(db, actor, { ...round, after: budgetPage.nextCursor })).toEqual({
    status: "not_found",
  });
});
