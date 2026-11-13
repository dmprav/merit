import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import {
  applicationAuditHistory,
  getFundingApplicationPage,
  roundBudgetHistory,
} from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

it("bounds browser history and continues older pages with current record authorization", async ({
  db,
  database,
}) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "History pages",
  });
  assert(round.status === "ok");
  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Local project",
    applicant: "Neighbours",
    requested: "100",
    answers: [],
  });
  assert(application.status === "ok");
  for (let revision = 0; revision < 22; revision++) {
    expect(
      await editFundingApplication(
        db,
        actor,
        {
          workspaceSlug,
          publicId: application.publicId,
          expectedRevision: revision,
          change: { action: "details", summary: `Update ${revision}` },
        },
        applicationWork,
      ),
    ).toMatchObject({ status: "ok" });
  }
  const page = await getFundingApplicationPage(db, actor, {
    workspaceSlug,
    publicId: application.publicId,
  });
  expect(page?.intake.history).toHaveLength(20);
  expect(page?.intake.materialVersions).toEqual([1]);
  const input = { workspaceSlug, applicationId: application.publicId };
  const first = await applicationAuditHistory(db, actor, input);
  assert(first.status === "ok" && first.nextCursor);
  expect(first.entries).toHaveLength(20);
  const last = await applicationAuditHistory(db, actor, { ...input, after: first.nextCursor });
  assert(last.status === "ok");
  expect(last.entries).toHaveLength(3);
  expect(last.nextCursor).toBeNull();
  expect(new Set([...first.entries, ...last.entries].map((entry) => entry.revision)).size).toBe(23);
  expect(last.entries.at(-1)?.action).toBe("application.created");
  expect(await applicationAuditHistory(db, { userId: "birch-manager" }, input)).toEqual({
    status: "not_found",
  });
  expect(await applicationAuditHistory(db, actor, { ...input, workspaceSlug: "birch" })).toEqual({
    status: "not_found",
  });
  for (let revision = 0; revision < 3; revision++) {
    expect(
      await editFundingRound(db, actor, {
        workspaceSlug,
        publicId: round.publicId,
        expectedRevision: revision,
        change: { section: "budget", amount: String(1000 + revision), reason: "Updated funding" },
      }),
    ).toMatchObject({ status: "ok" });
  }
  const budgets = await roundBudgetHistory(db, actor, {
    workspaceSlug,
    roundId: round.publicId,
    limit: 2,
  });
  assert(budgets.status === "ok" && budgets.nextCursor);
  expect(budgets.entries).toHaveLength(2);
  const older = await roundBudgetHistory(db, actor, {
    workspaceSlug,
    roundId: round.publicId,
    after: budgets.nextCursor,
  });
  assert(older.status === "ok");
  expect(older.entries).toHaveLength(1);
  expect(
    await roundBudgetHistory(
      db,
      { userId: "birch-manager" },
      { workspaceSlug, roundId: round.publicId },
    ),
  ).toEqual({ status: "not_found" });
  await database.client.query(
    "UPDATE memberships SET role = 'member' WHERE organization_id='alder' AND user_id='dana'",
  );
  expect(await applicationAuditHistory(db, actor, { ...input, after: first.nextCursor })).toEqual({
    status: "not_found",
  });
});
