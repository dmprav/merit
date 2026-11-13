import { assert, expect } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { databaseTest } from "@merit/test-support/database";

import { applicationWork } from "../src/server/persistence/commands/application-work";

const actor = { userId: "dana" };
const it = databaseTest.extend("scenario", async ({ db, database }) => {
  await seedExampleRounds(db);
  const { rows } = await database.client.query<{ id: string; contact_id: string }>(
    "SELECT id, contact_id FROM application_cases WHERE organization_id='alder' AND id=$1",
    [(await fundingExampleIds("alder")).applications.A1],
  );
  const application = rows[0];
  assert.isDefined(application);
  return {
    address: { workspaceSlug: "alder", publicId: application.id },
    contactId: application.contact_id,
  };
});

const versionUpdates = {
  material: "UPDATE material_versions SET content=content",
  criteria: "UPDATE criteria_versions SET criteria=criteria",
  assessment: "UPDATE assessment_versions SET content=content",
  recommendation: "UPDATE recommendation_versions SET content=content",
};

it.for(["material", "criteria", "assessment", "recommendation"] as const)(
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
  "criteria_versions",
  "assessment_versions",
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

it("requires current material and review bases to belong to the same case", async ({
  database,
  scenario,
}) => {
  // Version 2 exists for Workshop Saturdays, but not for this case.
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
  const { rows } = await database.client.query<{ id: string }>(
    "SELECT id FROM contacts WHERE organization_id='birch' LIMIT 1",
  );
  assert.isDefined(rows[0]);
  await expect(
    database.client.query("UPDATE application_cases SET contact_id=$1 WHERE id=$2", [
      rows[0].id,
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

it("rejects staff interpretation embedded in a new material version", async ({
  database,
  scenario,
}) => {
  await expect(
    database.client.query(
      `INSERT INTO material_versions (case_id, version, content, change_kind, source)
     SELECT case_id, 99, content || '{"version":99,"summary":"Internal judgment"}'::jsonb,
       'correction', source FROM material_versions WHERE case_id=$1 AND version=1`,
      [scenario.address.publicId],
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
