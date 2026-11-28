import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect, vi } from "vite-plus/test";

import {
  intakeApplicationSchema,
  materialVersionSchema,
  type IntakeChange,
} from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import storedHistory from "@merit/applications/testing/history";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { encodeApplicationDetail } from "@merit/grantmaking/api";
import {
  applicationAuditHistory,
  getFundingApplicationPage,
  getFundingRoundPage,
  listWorkspaceApplications,
} from "@merit/grantmaking/server";
import { fromMinorUnits, toDecimal } from "@merit/money";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { encodeRecommendation } from "@merit/recommendations/api";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { reviewRevisionSchema, type ReviewChange } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { isCurrentAssessment } from "@merit/reviews/server/integrations";
import { createFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { contactWork } from "./contact-work";
import { makeAssessment } from "./fixtures";

const setup = async (db: NodePgDatabase) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    title: "Intake round",
    requestId: randomUUID(),
  });

  if (round.status !== "ok") {
    throw new Error("Round creation failed");
  }

  const request = {
    workspaceSlug,
    publicId: round.publicId,
    title: "Community meals",
    requestId: randomUUID(),
  };
  const created = await createFundingApplication(db, actor, request);

  if (created.status !== "ok") {
    throw new Error("Application creation failed");
  }

  const address = { workspaceSlug, publicId: created.publicId };

  const read = async () => (await getFundingApplicationPage(db, actor, address))!;

  const change = async (change: IntakeChange) =>
    editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change,
      },
      applicationWork,
    );

  return { round, request, created, address, read, change };
};

const content = {
  title: "Community meals",
  applicant: "Neighbourhood Kitchen",
  requested: "24000.00",
  answers: [
    {
      questionId: "535419fe-0936-5505-9046-3d66510742c3",
      question: "Plan",
      response: "Weekly meals with local residents.",
    },
  ],
};

it("reads initial-format intake history without rewriting stored snapshots", async ({
  db,
  database,
}) => {
  const { created, read } = await setup(db);
  const original = (
    await database.client.query<{ before: unknown; after: unknown }>(
      "SELECT details->'before' AS before, details->'after' AS after FROM audit_events WHERE target_id = $1",
      [created.publicId],
    )
  ).rows;
  expect(original).toMatchObject([{ before: null, after: { formatVersion: 1 } }]);

  const snapshot = {
    ...storedHistory,
    application: { ...storedHistory.application, id: created.publicId },
  };
  await database.client.query(
    `INSERT INTO audit_events (target_type, target_id, target_revision, organization_id, actor_user_id, action, details)
     SELECT target_type, target_id, 1, organization_id, actor_user_id, 'application.summary_changed', jsonb_build_object('before', $2::jsonb, 'after', $2::jsonb)
     FROM audit_events WHERE target_id = $1 AND target_revision = 0`,
    [created.publicId, JSON.stringify(snapshot)],
  );
  const liveParser = vi.spyOn(intakeApplicationSchema, "parse");
  try {
    const history = await applicationAuditHistory(db, actor, {
      workspaceSlug,
      applicationId: created.publicId,
    });
    assert(history.status === "ok");
    expect(history.entries[0]?.after).toEqual(snapshot.application);
    expect(liveParser).not.toHaveBeenCalled();
  } finally {
    liveParser.mockRestore();
  }
  const page = await read();
  expect(page.intake.history).toHaveLength(2);
  expect(page.intake.history[0]).toMatchObject({
    before: snapshot.application,
    after: snapshot.application,
  });
  expect(page.intake.history[1]).toMatchObject({ before: null, after: { id: created.publicId } });
  expect(
    (
      await database.client.query(
        "SELECT details->'before' AS before, details->'after' AS after FROM audit_events WHERE target_id = $1 ORDER BY target_revision",
        [created.publicId],
      )
    ).rows,
  ).toEqual([...original, { before: snapshot, after: snapshot }]);
});

const setupContact = async (db: NodePgDatabase) => {
  const saved = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create",
      details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
    },
    contactWork,
  );
  assert(saved.status === "ok");
  return saved.contact;
};

const recommend = async (
  db: NodePgDatabase,
  scenario: Awaited<ReturnType<typeof setup>>,
  position: "Fund" | "Defer" = "Fund",
) => {
  const page = await scenario.read();
  return saveFundingRecommendation(
    db,
    actor,
    {
      ...scenario.address,
      expectedRevision: page.recommendationVersion,
      expectedApplicationVersion: page.application.version,
      recommendation: encodeRecommendation({
        position,
        allocation: fromMinorUnits(position === "Fund" ? 2400000n : 0n),
        reasoning: "Consider the current request.",
      }),
    },
    isCurrentAssessment,
  );
};

const review = async (
  db: NodePgDatabase,
  scenario: Awaited<ReturnType<typeof setup>>,
  change: ReviewChange,
) => {
  const page = await scenario.read();
  return saveApplicationReview(db, actor, {
    ...scenario.address,
    expectedRevision: reviewRevisionSchema.parse(page.application.reviews.revision),
    expectedApplicationVersion: materialVersionSchema.parse(page.application.version),
    expectedCriteriaVersion: page.round.criteriaVersion,
    change,
  });
};

const setupRecommended = async (db: NodePgDatabase) => {
  const scenario = await setup(db);
  assert((await scenario.change({ action: "save_content", content })).status === "ok");
  assert((await scenario.change({ action: "mark_ready" })).status === "ok");
  assert((await recommend(db, scenario)).status === "ok");
  return scenario;
};

const stageRevision = async (scenario: Awaited<ReturnType<typeof setup>>) => {
  assert((await scenario.change({ action: "start_revision", kind: "revision" })).status === "ok");
  assert(
    (
      await scenario.change({
        action: "save_revision",
        draft: {
          kind: "revision",
          reason: "New venue costs",
          content: { ...content, requested: "28000.00" },
        },
      })
    ).status === "ok",
  );
};

it("rejects funding for an application still in preparation without recording a recommendation", async ({
  db,
}) => {
  const scenario = await setup(db);
  const before = await scenario.read();
  expect(before.application.managerRecommendation).toBeNull();

  expect(await recommend(db, scenario)).toMatchObject({
    status: "invalid",
    error: "application_not_ready",
  });
  expect(await scenario.read()).toEqual(before);
});

it("allows deferral while intake is incomplete", async ({ db }) => {
  const scenario = await setup(db);

  expect(await recommend(db, scenario, "Defer")).toMatchObject({ status: "ok" });
  expect(encodeApplicationDetail(await scenario.read()).application).toMatchObject({
    intakeStatus: "in_preparation",
    managerRecommendation: { position: "Defer", allocation: { minorUnits: "0", currency: "EUR" } },
  });
});

it("funds ready intake before a round budget has been set", async ({ db }) => {
  const scenario = await setup(db);
  assert((await scenario.change({ action: "save_content", content })).status === "ok");
  assert((await scenario.change({ action: "mark_ready" })).status === "ok");

  expect(await recommend(db, scenario)).toMatchObject({ status: "ok", budget: null });
  const page = await scenario.read();
  expect(toDecimal(page.round.totals.proposed)).toBe("24000.00");
  expect(page.application.managerRecommendation).toMatchObject({
    position: "Fund",
    recorded: { applicationVersion: page.application.version },
  });
});

it("keeps staged applicant changes separate from published content and its recommendation", async ({
  db,
}) => {
  const scenario = await setupRecommended(db);
  const original = await scenario.read();

  await stageRevision(scenario);

  const staged = await scenario.read();
  expect(encodeApplicationDetail(staged).application).toEqual(
    encodeApplicationDetail(original).application,
  );
  expect(staged.intake.workingRevision).toMatchObject({
    reason: "New venue costs",
    content: { requested: "28000.00" },
  });
});

it("publishes a revision with authored history while preserving the recommendation's original basis and allocation", async ({
  db,
  database,
}) => {
  const scenario = await setupRecommended(db);
  const original = await scenario.read();
  await stageRevision(scenario);

  expect(await scenario.change({ action: "publish_revision" })).toMatchObject({ status: "ok" });

  const revised = await scenario.read();
  expect(revised.application.version).toBe(original.application.version + 1);
  expect(toDecimal(revised.application.requested!)).toBe("28000.00");
  expect(encodeRecommendation(revised.application.managerRecommendation!)).toEqual(
    encodeRecommendation(original.application.managerRecommendation!),
  );
  expect(toDecimal(revised.round.totals.proposed)).toBe("24000.00");
  expect(revised.intake.history[0]).toMatchObject({
    action: "application.revision_recorded",
    reason: "New venue costs",
    actor: "Dana Reed",
    before: {
      version: original.application.version,
    },
    after: {
      version: revised.application.version,
    },
  });
  for (const snapshot of [revised.intake.history[0]?.before, revised.intake.history[0]?.after]) {
    expect(snapshot).not.toHaveProperty("reviews");
    expect(snapshot).not.toHaveProperty("managerRecommendation");
  }
  const stored = await database.client.query<{ before: unknown; after: unknown }>(
    "SELECT details->'before' AS before, details->'after' AS after FROM audit_events WHERE target_id = $1 ORDER BY target_revision DESC LIMIT 1",
    [revised.application.id],
  );
  for (const snapshot of [stored.rows[0]?.before, stored.rows[0]?.after]) {
    expect(snapshot).not.toHaveProperty("application.reviews");
    expect(snapshot).not.toHaveProperty("application.managerRecommendation");
  }
  expect(revised.intake.workingRevision).toBeNull();
  const roundPage = await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: scenario.round.publicId,
    kind: "round",
  });
  assert.isNotNull(roundPage);
  expect(toDecimal(roundPage.round.totals.requested)).toBe("28000.00");
  expect(roundPage.round.applicationCount).toBe(1);
});

it("records a new recommendation against the published application version", async ({ db }) => {
  const scenario = await setupRecommended(db);
  await stageRevision(scenario);
  assert((await scenario.change({ action: "publish_revision" })).status === "ok");
  const revised = await scenario.read();

  const changedEvidence = () =>
    listWorkspaceApplications(db, actor, { workspaceSlug, filter: { evidence: "changed" } });

  expect(await changedEvidence()).toMatchObject({
    status: "ok",
    applications: [{ id: revised.application.id, recommendation: { outdated: true } }],
  });

  expect(await recommend(db, scenario)).toMatchObject({
    status: "ok",
    recommendation: { recorded: { applicationVersion: revised.application.version } },
  });
  expect(
    (await scenario.read()).application.managerRecommendation?.recorded?.applicationVersion,
  ).toBe(revised.application.version);
  expect(await changedEvidence()).toMatchObject({ status: "ok", applications: [] });
});

it.for([
  "a deferral",
  "an assessment without a request",
  "an outstanding review request",
  "a cancelled review request",
] as const)(
  "rejects deleting preparation whose only usage is %s without changing its content or history",
  async (usage, { db }) => {
    const scenario = await setup(db);
    if (usage === "a deferral") {
      assert((await recommend(db, scenario, "Defer")).status === "ok");
    } else if (usage === "an assessment without a request") {
      const contact = await setupContact(db);
      const recorded = await review(db, scenario, {
        action: "record",
        id: randomUUID(),
        contactId: contact.id,
        requestId: null,
        previousId: null,
        content: makeAssessment().versions[0]!.content,
      });
      assert(recorded.status === "ok");
    } else {
      const contact = await setupContact(db);
      const id = randomUUID();
      const requested = await review(db, scenario, {
        action: "request",
        id,
        contactId: contact.id,
        replacesId: null,
      });
      assert(requested.status === "ok");
      if (usage === "a cancelled review request") {
        assert((await review(db, scenario, { action: "cancel", id })).status === "ok");
      }
    }
    const before = await scenario.read();
    expect(before.application.intakeStatus).toBe("in_preparation");

    expect(await scenario.change({ action: "delete" })).toEqual({
      status: "invalid",
      error: "application_in_use",
    });
    expect(await scenario.read()).toEqual(before);
  },
);

const firstEdit = (address: { workspaceSlug: string; publicId: string }) => ({
  ...address,
  expectedRevision: 0,
  change: { action: "save_content" as const, content },
});

it("hides an application from a manager of another workspace", async ({ db }) => {
  const { address, read, request } = await setup(db);
  const before = await read();
  const other = { userId: "birch-manager" };

  expect(await editFundingApplication(db, other, firstEdit(address), applicationWork)).toEqual({
    status: "not_found",
  });
  expect(await createFundingApplication(db, other, request)).toEqual({ status: "not_found" });
  expect(await getFundingApplicationPage(db, other, address)).toBeNull();
  expect(await read()).toEqual(before);
});

it("checks current grant access, so a member who lost it can neither edit nor read", async ({
  db,
  database,
}) => {
  const { address, read } = await setup(db);
  const before = await read();
  await database.client.query("UPDATE memberships SET role = 'member' WHERE user_id = 'dana'");

  expect(await editFundingApplication(db, actor, firstEdit(address), applicationWork)).toEqual({
    status: "not_found",
  });
  expect(await getFundingApplicationPage(db, actor, address)).toBeNull();
  await database.client.query(
    "UPDATE memberships SET role = 'program_manager' WHERE user_id = 'dana'",
  );
  expect(await read()).toEqual(before);
});

it("prevents deleting a round until its applications have been deleted", async ({ db }) => {
  const { round, change } = await setup(db);

  const deleteRound = () =>
    deleteFundingRound(
      db,
      actor,
      { workspaceSlug, publicId: round.publicId, expectedRevision: 0 },
      roundHasApplications,
    );

  expect(await deleteRound()).toMatchObject({ status: "invalid", error: "round_not_empty" });
  assert((await change({ action: "delete" })).status === "ok");
  expect(await deleteRound()).toEqual({ status: "ok" });
});
