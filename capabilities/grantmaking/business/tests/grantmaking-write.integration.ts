import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { editFundingApplication, selectApplicationContact } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { roundCommitments } from "./application-work";
import { contactWork } from "./contact-work";
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
    contactWork,
  );
  assert(created.status === "ok", "Could not create the contact fixture");
  return created.contact.id;
};

const alder = { slug: "alder", userId: actor.userId };

// One application with every kind of recorded version, and another whose material
// has a second version that the first application lacks.
const it = roundTest.extend("scenario", async ({ db, rounds }) => {
  const criterionId = randomUUID();
  const editedRound = await editFundingRound(
    db,
    actor,
    {
      workspaceSlug: rounds.pageInput.workspaceSlug,
      publicId: rounds.pageInput.publicId,
      expectedRevision: 0,
      change: {
        section: "criteria",
        criteria: [{ id: criterionId, title: "Community fit", description: "Community benefit" }],
      },
    },
    roundCommitments,
  );
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

  return { address };
});

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
