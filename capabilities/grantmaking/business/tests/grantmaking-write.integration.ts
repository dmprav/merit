import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { editFundingApplication, selectApplicationContact } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { roundTest } from "./round-test";

const createContact = async (
  db: NodePgDatabase,
  workspace: { slug: string; userId: string },
  name: string,
) => {
  const created = await changeWorkspaceContact(
    db,
    { userId: workspace.userId },
    {
      workspaceSlug: workspace.slug,
      contactId: randomUUID(),
      action: "create",
      details: { name, email: "", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(created.status === "ok", "Could not create the contact fixture");
  return created.contact.id;
};

const alder = { slug: "alder", userId: actor.userId };

// One application with every kind of recorded version, and another whose material
// has a second version that the first application lacks.
const it = roundTest.extend("scenario", async ({ db, rounds }) => {
  const criterionId = randomUUID();
  const editedRound = await editFundingRound(db, actor, {
    workspaceSlug: rounds.pageInput.workspaceSlug,
    publicId: rounds.pageInput.publicId,
    expectedRevision: 0,
    change: {
      section: "criteria",
      criteria: [{ id: criterionId, title: "Community fit", description: "Community benefit" }],
    },
  });
  assert(editedRound.status === "ok", "Could not add criteria fixture");
  const address = await rounds.createApplication("Recorded application");
  await rounds.recommendApplication(address, "8000");
  const contactId = await createContact(db, alder, "Robin Hale");
  const linked = await selectApplicationContact(db, actor, {
    ...address,
    expectedRevision: 1,
    contactId,
  });
  assert(linked.status === "ok", "Could not link the applicant contact");
  const basis = {
    expectedApplicationVersion: materialVersionSchema.parse(1),
    expectedCriteriaVersion: criteriaVersionSchema.parse(2),
  };
  const requested = await saveApplicationReview(db, actor, {
    ...address,
    ...basis,
    expectedRevision: reviewRevisionSchema.parse(0),
    change: {
      action: "request",
      id: randomUUID(),
      contactId: await createContact(db, alder, "Sam Morgan"),
      replacesId: null,
    },
  });
  assert(requested.status === "ok", "Could not request the review fixture");
  const assessmentId = randomUUID();
  const assessed = await saveApplicationReview(db, actor, {
    ...address,
    ...basis,
    expectedRevision: requested.revision,
    change: {
      action: "record",
      id: assessmentId,
      contactId: await createContact(db, alder, "Jules Hart"),
      requestId: null,
      previousId: null,
      content: {
        applicationVersion: basis.expectedApplicationVersion,
        criteriaVersion: basis.expectedCriteriaVersion,
        date: null,
        position: "Fund",
        amount: encodeMoney(fromMinorUnits(8000n)),
        reasoning: "Clear plan for weekly activities.",
        observations: [{ criterionId, criterion: "Community fit", text: "Matches round goals." }],
      },
    },
  });
  assert(assessed.status === "ok", "Could not record the assessment fixture");

  const revised = await rounds.createApplication("Revised application");
  const saved = await editFundingApplication(
    db,
    actor,
    {
      ...revised,
      expectedRevision: 0,
      change: { action: "save_content", content: { title: "Revised application title" } },
    },
    applicationWork,
  );
  assert(saved.status === "ok", "Could not record a second material version");

  return {
    roundId: rounds.pageInput.publicId,
    address,
    assessmentId,
    contactId,
    otherWorkspaceContactId: await createContact(
      db,
      { slug: "birch", userId: "birch-manager" },
      "Birch contact",
    ),
  };
});

const versionUpdates = {
  material: "UPDATE material_versions SET title=title",
  materialAnswer: "UPDATE material_version_answers SET response=response",
  criteria: "UPDATE criteria_versions SET version=version",
  criteriaItem: "UPDATE criteria_version_items SET title=title",
  assessment: "UPDATE assessment_versions SET reasoning=reasoning",
  assessmentObservation: "UPDATE assessment_version_observations SET text=text",
  recommendation: "UPDATE recommendation_versions SET reasoning=reasoning",
};

it.for([
  "material",
  "materialAnswer",
  "criteria",
  "criteriaItem",
  "assessment",
  "assessmentObservation",
  "recommendation",
] as const)(
  "rejects updates to recorded %s versions at the database boundary",
  async (kind, { db, database, scenario }) => {
    const before = await getFundingApplicationPage(db, actor, scenario.address);
    await expect(database.client.query(versionUpdates[kind])).rejects.toMatchObject({
      code: "23514",
    });
    expect(await getFundingApplicationPage(db, actor, scenario.address)).toEqual(before);
  },
);

it.for([
  "material_versions",
  "material_version_answers",
  "criteria_versions",
  "criteria_version_items",
  "assessment_versions",
  "assessment_version_observations",
  "recommendation_versions",
] as const)(
  "preserves recorded %s rows while their owner exists",
  async (table, { database, scenario }) => {
    expect(
      (
        await database.client.query("SELECT 1 FROM application_cases WHERE id=$1", [
          scenario.address.publicId,
        ])
      ).rowCount,
    ).toBe(1);
    await expect(database.client.query(`DELETE FROM ${table}`)).rejects.toMatchObject({
      code: "23514",
    });
  },
);

it.for([
  "criteria_version_items",
  "material_version_answers",
  "material_version_evidence",
  "assessment_version_observations",
] as const)(
  "rejects adding %s rows to a committed version at the database boundary",
  async (table, { db, database, scenario }) => {
    const before = await getFundingApplicationPage(db, actor, scenario.address);
    const queries = {
      criteria_version_items: {
        sql: "INSERT INTO criteria_version_items (round_id, version, position, criterion_id, title) VALUES ($1, 2, 1, $2, 'Extra')",
        params: [scenario.roundId, randomUUID()],
      },
      material_version_answers: {
        sql: "INSERT INTO material_version_answers (case_id, material_version, position, question_id, question, response) VALUES ($1, 1, 1, $2, 'Extra', 'Added')",
        params: [scenario.address.publicId, randomUUID()],
      },
      material_version_evidence: {
        sql: "INSERT INTO material_version_evidence (case_id, material_version, position, evidence_version, passage) VALUES ($1, 1, 0, 1, 'Added')",
        params: [scenario.address.publicId],
      },
      assessment_version_observations: {
        sql: "INSERT INTO assessment_version_observations (case_id, assessment_id, version, position, criterion_id, criterion, text) VALUES ($1, $2, 1, 1, NULL, 'Extra', 'Added')",
        params: [scenario.address.publicId, scenario.assessmentId],
      },
    };
    const query = queries[table];
    await expect(database.client.query(query.sql, query.params)).rejects.toMatchObject({
      code: "23514",
    });
    expect(await getFundingApplicationPage(db, actor, scenario.address)).toEqual(before);
  },
);

it("requires current material and review bases to belong to the same case", async ({
  database,
  scenario,
}) => {
  // Version 2 exists for the revised application, but not for this case.
  expect(
    (await database.client.query("SELECT 1 FROM material_versions WHERE version=2")).rowCount,
  ).toBeGreaterThan(0);
  await expect(
    database.client.query("UPDATE application_cases SET material_version=2 WHERE id=$1", [
      scenario.address.publicId,
    ]),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    database.client.query("UPDATE review_requests SET material_version=2 WHERE case_id=$1", [
      scenario.address.publicId,
    ]),
  ).rejects.toMatchObject({ code: "23503" });
  expect(
    (
      await database.client.query<{ material_version: number }>(
        "SELECT material_version FROM application_cases WHERE id=$1",
        [scenario.address.publicId],
      )
    ).rows,
  ).toEqual([{ material_version: 1 }]);
});

it("prevents an application case from linking another organization's contact", async ({
  database,
  scenario,
}) => {
  await expect(
    database.client.query("UPDATE application_cases SET contact_id=$1 WHERE id=$2", [
      scenario.otherWorkspaceContactId,
      scenario.address.publicId,
    ]),
  ).rejects.toMatchObject({ code: "23503" });
  expect(
    (
      await database.client.query<{ contact_id: string }>(
        "SELECT contact_id FROM application_cases WHERE id=$1",
        [scenario.address.publicId],
      )
    ).rows,
  ).toEqual([{ contact_id: scenario.contactId }]);
});

it("keeps staff summary edits out of material versions and review bases", async ({
  db,
  database,
  scenario,
}) => {
  const before = (await getFundingApplicationPage(db, actor, scenario.address))!;
  const material = await database.client.query(
    "SELECT * FROM material_versions WHERE case_id=$1 ORDER BY version",
    [scenario.address.publicId],
  );
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...scenario.address,
        expectedRevision: before.intake.revision,
        change: { action: "details", summary: "Staff interpretation after discussion." },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok", revision: before.intake.revision + 1 });
  expect(
    (
      await database.client.query(
        "SELECT * FROM material_versions WHERE case_id=$1 ORDER BY version",
        [scenario.address.publicId],
      )
    ).rows,
  ).toEqual(material.rows);
  const after = (await getFundingApplicationPage(db, actor, scenario.address))!;
  expect(after.application.version).toBe(before.application.version);
  expect(after.application.reviews).toEqual(before.application.reviews);
  expect(after.application.summary).toBe("Staff interpretation after discussion.");
});

it("enforces relational intake boundaries on recorded material versions", async ({
  database,
  scenario,
}) => {
  await expect(
    database.client.query(
      `INSERT INTO material_versions (case_id, version, title, requested_minor_units, requested_currency, change_kind, source_kind)
       VALUES ($1, 99, 'Invalid requested amount', -1, 'EUR', 'correction', 'recorded_external')`,
      [scenario.address.publicId],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const columns = (
    await database.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'material_versions'`,
    )
  ).rows.map((row) => row.column_name);
  expect(columns).not.toContain("summary");
  expect(columns).not.toContain("reviews");
  expect(columns).not.toContain("manager_recommendation");
});
