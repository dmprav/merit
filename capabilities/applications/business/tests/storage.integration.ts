import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { selectApplicationContact } from "@merit/applications/server";
import { contacts } from "@merit/contacts/schema";
import { actor } from "@merit/organizations/testing/workspace";

import { applicationTest as it } from "./application-test";
import { readPersistedApplication } from "./persisted-application";

it.for([
  "UPDATE material_versions SET title=title",
  "DELETE FROM material_versions",
  "UPDATE material_version_answers SET response=response",
  "DELETE FROM material_version_answers",
])("rejects mutation of recorded versions: %s", async (query, { db, database, applications }) => {
  const { publicId } = await applications.createApplication("Recorded application");
  const before = await readPersistedApplication(db, publicId);
  await expect(database.client.query(query)).rejects.toMatchObject({ code: "23514" });
  expect(await readPersistedApplication(db, publicId)).toEqual(before);
});

it.for(["answers", "evidence"] as const)(
  "rejects adding %s to a committed material version",
  async (kind, { applications, db, database }) => {
    const { publicId } = await applications.createApplication("Recorded application");
    const before = await readPersistedApplication(db, publicId);
    const insert =
      kind === "answers"
        ? database.client.query(
            "INSERT INTO material_version_answers (case_id, material_version, position, question_id, question, response) VALUES ($1, 1, 1, $2, 'Extra', 'Added')",
            [publicId, randomUUID()],
          )
        : database.client.query(
            "INSERT INTO material_version_evidence (case_id, material_version, position, evidence_version, passage) VALUES ($1, 1, 0, 1, 'Added')",
            [publicId],
          );
    await expect(insert).rejects.toMatchObject({ code: "23514" });
    expect(await readPersistedApplication(db, publicId)).toEqual(before);
  },
);

it("prevents an application case from linking another organization's contact", async ({
  database,
  db,
  applications,
}) => {
  const address = await applications.createApplication("Recorded application");
  const [contact, foreignContact] = await db
    .insert(contacts)
    .values([
      { organizationId: "alder", name: "Robin Hale" },
      { organizationId: "birch", name: "Birch contact" },
    ])
    .returning({ id: contacts.id });
  assert.isDefined(contact);
  assert.isDefined(foreignContact);
  expect(
    await selectApplicationContact(db, actor, {
      ...address,
      expectedRevision: 0,
      contactId: contact.id,
    }),
  ).toMatchObject({ status: "ok" });
  await expect(
    database.client.query("UPDATE application_cases SET contact_id=$1 WHERE id=$2", [
      foreignContact.id,
      address.publicId,
    ]),
  ).rejects.toMatchObject({ code: "23503" });
  expect(
    (
      await database.client.query<{ contact_id: string }>(
        "SELECT contact_id FROM application_cases WHERE id=$1",
        [address.publicId],
      )
    ).rows,
  ).toEqual([{ contact_id: contact.id }]);
});

it("enforces relational intake boundaries on recorded material versions", async ({
  database,
  applications,
}) => {
  const address = await applications.createApplication("Recorded application");
  await expect(
    database.client.query(
      `INSERT INTO material_versions (case_id, version, title, requested_minor_units, requested_currency, change_kind, source_kind)
       VALUES ($1, 99, 'Invalid requested amount', -1, 'EUR', 'correction', 'recorded_external')`,
      [address.publicId],
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
