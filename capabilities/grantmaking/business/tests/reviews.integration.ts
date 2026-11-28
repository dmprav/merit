import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import {
  createFundingApplication,
  editFundingApplication,
  selectApplicationContact,
} from "@merit/applications/server";
import { listWorkspaceContacts, changeWorkspaceContact } from "@merit/contacts/server";
import {
  getFundingApplicationPage,
  getFundingApplicationContent,
  getFundingRoundPage,
} from "@merit/grantmaking/server";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import type { ReviewChange } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { isCurrentAssessment } from "@merit/reviews/server/integrations";
import { contact, content, unknownBasisRecord } from "@merit/reviews/testing/assessment";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { roundCommitments } from "./application-work";
import { contactWork } from "./contact-work";

const setup = async (db: NodePgDatabase) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Review round",
  });

  if (round.status !== "ok") {
    throw new Error("Round creation failed");
  }

  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Workshop Saturdays",
    applicant: "Repair Collective",
    requested: "18000",
    answers: [
      {
        questionId: "9841b190-2a06-5fe1-a7af-5e5b534662c5",
        question: "Plan",
        response: "Repair workshops with a free venue.",
      },
    ],
  });

  if (application.status !== "ok") {
    throw new Error("Application creation failed");
  }

  const address = { workspaceSlug, publicId: application.publicId };

  const read = async () => (await getFundingApplicationPage(db, actor, address))!;

  const review = async (change: ReviewChange) => {
    const page = await read();

    return saveApplicationReview(db, actor, {
      ...address,
      expectedRevision: page.application.reviews.revision,
      expectedApplicationVersion: page.application.version,
      expectedCriteriaVersion: page.round.criteriaVersion,
      change,
    });
  };

  return { round, address, read, review };
};

const recommendationFromAssessment = async (db: NodePgDatabase) => {
  const { round, address, read, review } = await setup(db);
  const sam = await contact(db);
  const id = randomUUID();
  const record = {
    action: "record" as const,
    id,
    contactId: sam.id,
    requestId: null,
    previousId: null,
    content,
  };
  expect(await review(record)).toMatchObject({ status: "ok" });
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change: { action: "mark_ready" },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok" });

  const save = () =>
    saveFundingRecommendation(
      db,
      actor,
      {
        ...address,
        expectedRevision: 0,
        expectedApplicationVersion: 1,
        expectedCurrentAssessment: { id, version: 1 },
        recommendation: {
          position: "Fund",
          allocation: content.amount,
          reasoning: content.reasoning,
        },
      },
      isCurrentAssessment,
    );

  return { round, read, review, record, save };
};

it("checks criteria content again when saving a recommendation from an assessment", async ({
  db,
}) => {
  const { round, save, read } = await recommendationFromAssessment(db);

  const setCriteria = (
    expectedRevision: number,
    criteria: { id: string; title: string; description: string }[],
  ) =>
    editFundingRound(
      db,
      actor,
      {
        workspaceSlug,
        publicId: round.publicId,
        expectedRevision,
        change: { section: "criteria", criteria },
      },
      roundCommitments,
    );

  expect(
    await setCriteria(0, [{ id: randomUUID(), title: "Local benefit", description: "" }]),
  ).toMatchObject({ status: "ok" });
  expect(await save()).toEqual({ status: "conflict" });
  expect((await read()).recommendationVersion).toBe(0);
  expect(await setCriteria(1, [])).toMatchObject({ status: "ok" });
  expect(await save()).toMatchObject({ status: "ok", recommendationVersion: 1 });
});

it.for(["corrected", "superseded"] as const)(
  "rejects a conditional recommendation when the selected assessment is %s",
  async (change, { db }) => {
    const { record, review, save, read } = await recommendationFromAssessment(db);
    const changed =
      change === "corrected"
        ? await review({
            action: "edit",
            id: record.id,
            note: "Corrected the amount",
            content: { ...content, amount: encodeMoney(fromMinorUnits(1250000n)) },
          })
        : await review({ ...record, previousId: record.id, id: randomUUID() });
    expect(changed).toMatchObject({ status: "ok" });
    expect(await save()).toEqual({ status: "conflict" });
    expect((await read()).recommendationVersion).toBe(0);
  },
);

it("recreates the changed-budget scenario, keeps history, and distinguishes follow-up work", async ({
  db,
}) => {
  const { round, address, read, review } = await setup(db);
  const sam = await contact(db);
  const jules = await contact(db, "Jules");
  const samRequest = randomUUID();
  const julesRequest = randomUUID();

  expect(
    await review({ action: "request", id: samRequest, contactId: sam.id, replacesId: null }),
  ).toMatchObject({ status: "ok" });
  expect(
    await review({ action: "request", id: julesRequest, contactId: jules.id, replacesId: null }),
  ).toMatchObject({ status: "ok" });

  const assessment = randomUUID();

  expect(
    await review({
      action: "record",
      id: assessment,
      contactId: sam.id,
      requestId: samRequest,
      previousId: null,
      content,
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change: { action: "mark_ready" },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok" });
  expect(
    await saveFundingRecommendation(
      db,
      actor,
      {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        recommendation: {
          position: "Fund",
          allocation: encodeMoney(fromMinorUnits(1800000n)),
          reasoning: "Support the original plan.",
        },
      },
      isCurrentAssessment,
    ),
  ).toMatchObject({ status: "ok" });

  const edit = async (change: Parameters<typeof editFundingApplication>[2]["change"]) =>
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

  await edit({ action: "start_revision", kind: "revision" });
  await edit({
    action: "save_revision",
    draft: {
      kind: "revision",
      reason: "Free venue lost",
      content: {
        title: "Workshop Saturdays",
        applicant: "Repair Collective",
        requested: "22000",
        answers: [
          {
            questionId: "9841b190-2a06-5fe1-a7af-5e5b534662c5",
            question: "Plan",
            response: "Replacement venue costs 4000.",
          },
        ],
      },
    },
  });

  expect(await edit({ action: "publish_revision" })).toMatchObject({ status: "ok" });

  let page = await read();

  expect(page.application.assessments.map((value) => value.status)).toEqual([
    "outdated",
    "outstanding",
  ]);
  expect(encodeMoney(page.application.managerRecommendation!.allocation).minorUnits).toBe(
    "1800000",
  );
  expect(
    await review({
      action: "edit",
      id: assessment,
      content: { ...content, reasoning: "Corrected transcription." },
      note: "",
    }),
  ).toMatchObject({ status: "ok" });

  page = await read();

  expect(
    (
      page.application.reviews!.assessments[0] ??
      assert.fail("Expected page.application.reviews!.assessments[0]")
    ).versions,
  ).toHaveLength(2);

  const roundPage = (await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    kind: "round",
  }))!;

  expect(
    await editFundingRound(
      db,
      actor,
      {
        workspaceSlug,
        publicId: round.publicId,
        expectedRevision: roundPage.preparation.revision,
        change: {
          section: "criteria",
          criteria: [
            {
              id: "64b39d9c-7b1e-5614-a6fa-bee3d45492d6",
              title: "Venue",
              description: "Check the replacement venue.",
            },
          ],
        },
      },
      roundCommitments,
    ),
  ).toMatchObject({ status: "ok" });

  page = await read();

  expect(
    (page.application.assessments[0] ?? assert.fail("Expected page.application.assessments[0]"))
      .criteriaChanged,
  ).toBe(true);
  expect(page.application.reviews!.requests).toHaveLength(2);

  const followup = randomUUID();
  await review({ action: "request", id: followup, contactId: sam.id, replacesId: null });
  await review({
    action: "record",
    id: randomUUID(),
    contactId: sam.id,
    requestId: followup,
    previousId: assessment,
    content: {
      ...content,
      applicationVersion: materialVersionSchema.parse(2),
      criteriaVersion: criteriaVersionSchema.parse(2),
      position: null,
      amount: null,
      reasoning: "Need the venue confirmation.",
    },
  });
  page = await read();

  expect(page.application.assessments.map((value) => value.status)).toEqual([
    "current",
    "outstanding",
  ]);
  expect(page.application.reviews!.assessments).toHaveLength(2);
});

it("resolves live contact details without rewriting applications or history", async ({
  db,
  database,
}) => {
  const { address, read, review } = await setup(db);
  const sam = await contact(db);

  expect(
    await selectApplicationContact(db, actor, {
      ...address,
      expectedRevision: 0,
      contactId: sam.id,
    }),
  ).toEqual({ status: "ok", revision: 1 });

  const requestId = randomUUID();
  await review({ action: "request", id: requestId, contactId: sam.id, replacesId: null });
  const previousPage = await read();
  const storedBefore = (
    await database.client.query(
      "SELECT m.title, m.applicant_organization, m.submission_version, m.requested_minor_units, c.revision FROM application_cases c JOIN material_versions m ON m.case_id=c.id AND m.version=c.material_version WHERE c.id = $1",
      [address.publicId],
    )
  ).rows;
  const materialColumns = (
    await database.client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='material_versions'",
    )
  ).rows.map((row) => row.column_name);
  expect(materialColumns).not.toContain("contact");
  expect(materialColumns).not.toContain("contact_email");

  const change = {
    workspaceSlug,
    contactId: sam.id,
    action: "update" as const,
    details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
  };

  expect(await changeWorkspaceContact(db, actor, change, contactWork)).toMatchObject({
    status: "ok",
  });

  const page = await read();

  expect(page.application.submission?.contact).toBe("Sam Morgan");
  expect(page.intake.revision).toBe(previousPage.intake.revision);
  expect(page.intake.history).toEqual(previousPage.intake.history);
  expect(
    (
      await database.client.query(
        "SELECT m.title, m.applicant_organization, m.submission_version, m.requested_minor_units, c.revision FROM application_cases c JOIN material_versions m ON m.case_id=c.id AND m.version=c.material_version WHERE c.id = $1",
        [address.publicId],
      )
    ).rows,
  ).toEqual(storedBefore);
  const mcpSubmission = await getFundingApplicationContent(db, actor, {
    workspaceSlug,
    applicationId: address.publicId,
    section: "submission",
  });
  assert(mcpSubmission.status === "ok");
  expect(JSON.parse(mcpSubmission.content)).toMatchObject({
    contact: "Sam Morgan",
    contactEmail: "sam@example.test",
  });
  const round = await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: page.round.id,
    kind: "round",
  });
  expect(round?.round.applicationCount).toBe(1);
  expect(
    (await getFundingApplicationPage(db, actor, address))?.application.submission?.contact,
  ).toBe("Sam Morgan");
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: previousPage.intake.revision,
        change: { action: "details", summary: "Saved after the contact changed" },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok" });

  expect(
    (
      page.application.reviews.requests[0] ??
      assert.fail("Expected page.application.reviews.requests[0]")
    ).reviewer,
  ).toBe("Sam");

  const directory = await listWorkspaceContacts(db, actor, { workspaceSlug }, contactWork);

  if (directory.status !== "ok") {
    throw new Error("Missing contact directory");
  }
  expect(directory.contacts.find((value) => value.id === sam.id)?.applicationTitles).toEqual([
    "Workshop Saturdays",
  ]);
  expect(page.application.version).toBe(1);
  expect(
    (page.intake.history[0] ?? assert.fail("Expected page.intake.history[0]")).after?.submission
      ?.contact,
  ).toBe("Sam");
});

const archiveContact = (db: NodePgDatabase, contactId: string) =>
  changeWorkspaceContact(
    db,
    actor,
    { workspaceSlug, contactId, action: "archive", expectedContactRevision: 0 },
    contactWork,
  );

it("blocks archiving a contact with an outstanding review request until it is cancelled", async ({
  db,
}) => {
  const { review } = await setup(db);
  const sam = await contact(db);
  const requestId = randomUUID();
  await review({ action: "request", id: requestId, contactId: sam.id, replacesId: null });

  expect(await archiveContact(db, sam.id)).toMatchObject({
    status: "invalid",
    error: "outstanding_requests",
  });

  await review({ action: "cancel", id: requestId });

  expect(await archiveContact(db, sam.id)).toMatchObject({ status: "ok" });
});

it("keeps an archived contact on its application", async ({ db }) => {
  const { address, read } = await setup(db);
  const sam = await contact(db);
  expect(
    await selectApplicationContact(db, actor, {
      ...address,
      expectedRevision: 0,
      contactId: sam.id,
    }),
  ).toEqual({ status: "ok", revision: 1 });
  expect(await archiveContact(db, sam.id)).toMatchObject({ status: "ok" });

  expect((await read()).application.contactId).toBe(sam.id);
});

it("rejects a new review request for an archived contact", async ({ db }) => {
  const { review } = await setup(db);
  const sam = await contact(db);
  expect(await archiveContact(db, sam.id)).toMatchObject({ status: "ok" });

  expect(
    await review({ action: "request", id: randomUUID(), contactId: sam.id, replacesId: null }),
  ).toMatchObject({ status: "invalid", error: "contact_unavailable" });
});

it("marks an assessment recorded without an application or criteria basis as unknown", async ({
  db,
}) => {
  const { read, review } = await setup(db);
  const sam = await contact(db);
  const change = unknownBasisRecord(sam.id);

  expect(await review(change)).toEqual({ status: "ok", revision: 1 });
  expect((await read()).application.assessments).toMatchObject([
    { id: change.id, status: "unknown" },
  ]);
});

it("rejects cross-workspace contact links and preserves the authorized profile", async ({
  db,
  database,
}) => {
  const { address, read } = await setup(db);
  const sam = await contact(db);
  await selectApplicationContact(db, actor, { ...address, expectedRevision: 0, contactId: sam.id });
  const before = await read();
  await expect(
    database.client.query("UPDATE contacts SET organization_id = 'birch' WHERE id = $1", [sam.id]),
  ).rejects.toMatchObject({ code: "23503" });
  expect(await read()).toEqual(before);
  const result = await getFundingApplicationContent(db, actor, {
    workspaceSlug,
    applicationId: address.publicId,
    section: "submission",
  });
  assert(result.status === "ok");
  expect(JSON.parse(result.content)).toMatchObject({ contact: sam.name });
});

it("supports contacts and reviews with the documented runtime grants and immutable history", async ({
  db,
}) => {
  const { address } = await setup(db);
  const role = `review_runtime_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("Remove the temporary role and grants");

  await expect(
    db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(
          `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        ),
      );
      await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
      await tx.execute(
        sql.raw(
          `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, application_cases, material_versions, material_version_answers, material_version_evidence, material_drafts, material_draft_answers, criteria_versions, criteria_version_items, review_states, review_requests, review_assignments, assessments, assessment_versions, assessment_version_observations, recommendation_versions, committee_decision_versions TO ${role}`,
        ),
      );
      await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (id) ON funding_rounds, app_users TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE ON application_cases TO ${role}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT ON audit_events TO ${role}`));
      await tx.execute(
        sql.raw(
          `GRANT INSERT ON material_versions, material_version_answers, material_version_evidence, assessments, assessment_versions, assessment_version_observations TO ${role}`,
        ),
      );
      await tx.execute(
        sql.raw(`GRANT INSERT, UPDATE ON review_states, review_requests TO ${role}`),
      );
      await tx.execute(
        sql.raw(
          `GRANT INSERT, UPDATE, DELETE ON material_drafts, material_draft_answers TO ${role}`,
        ),
      );
      await tx.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE ON contacts TO ${role}`));
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      const input = {
        workspaceSlug,
        contactId: randomUUID(),
        action: "create" as const,
        details: { name: "Runtime reviewer", email: "reviewer@example.test", affiliation: "" },
      };

      expect(await changeWorkspaceContact(tx, actor, input, contactWork)).toMatchObject({
        status: "ok",
      });
      expect(
        await selectApplicationContact(tx, actor, {
          ...address,
          expectedRevision: 0,
          contactId: input.contactId,
        }),
      ).toMatchObject({ status: "ok" });
      expect(
        await changeWorkspaceContact(
          tx,
          actor,
          {
            ...input,
            action: "update",
            details: { ...input.details, name: "Updated reviewer" },
          },
          contactWork,
        ),
      ).toMatchObject({ status: "ok", contact: { revision: 1 } });

      const contacts = await listWorkspaceContacts(tx, actor, { workspaceSlug }, contactWork);

      expect(contacts.status).toBe("ok");

      assert(contacts.status === "ok");

      expect(contacts.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: input.contactId, name: "Updated reviewer" }),
        ]),
      );

      const page = (await getFundingApplicationPage(tx, actor, address))!;

      expect(page.application.submission?.contact).toBe("Updated reviewer");
      expect(page.application.reviews).toEqual({ revision: 0, requests: [], assessments: [] });
      expect(page.round).toMatchObject({
        criteriaVersion: criteriaVersionSchema.parse(1),
        criteriaHistory: [{ version: 1, criteria: [] }],
      });

      const requestId = randomUUID();
      const baseline = {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      };

      expect(
        await saveApplicationReview(tx, actor, {
          ...baseline,
          change: {
            action: "request",
            id: requestId,
            contactId: input.contactId,
            replacesId: null,
          },
        }),
      ).toMatchObject({ status: "ok" });
      expect(
        await saveApplicationReview(tx, actor, {
          ...baseline,
          expectedRevision: reviewRevisionSchema.parse(1),
          change: {
            action: "record",
            id: randomUUID(),
            contactId: input.contactId,
            requestId,
            previousId: null,
            content,
          },
        }),
      ).toMatchObject({ status: "ok" });
      expect(
        (await getFundingApplicationPage(tx, actor, address))!.application.assessments,
      ).toMatchObject([{ reviewer: "Updated reviewer", status: "current" }]);
      expect(
        (
          await tx.execute(
            sql`SELECT has_table_privilege(current_user, 'audit_events', 'UPDATE') AS update, has_table_privilege(current_user, 'audit_events', 'DELETE') AS delete`,
          )
        ).rows,
      ).toEqual([{ update: false, delete: false }]);

      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
