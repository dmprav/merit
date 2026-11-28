import { randomUUID } from "node:crypto";

import { expect } from "vite-plus/test";

import { actor } from "@merit/organizations/testing/workspace";
import { editFundingRound } from "@merit/rounds/server";

import { noRoundCommitments, readPersistedRound } from "./persisted-round";
import { roundTest } from "./round-test";

roundTest(
  "rejects invalid calendar dates at the normalized storage boundary",
  async ({ database }) => {
    await expect(
      database.client.query(
        "UPDATE funding_rounds SET meeting_date = '2027-02-30' WHERE organization_id = 'alder'",
      ),
    ).rejects.toMatchObject({ code: "22008" });
  },
);

roundTest("rejects invalid budgets at the normalized storage boundary", async ({ database }) => {
  await expect(
    database.client.query(
      "UPDATE funding_rounds SET budget_minor_units = -1 WHERE organization_id = 'alder'",
    ),
  ).rejects.toThrow();
});

const it = roundTest.extend("criteriaRound", async ({ db, rounds }) => {
  const { workspaceSlug, publicId } = rounds.pageInput;
  expect(
    await editFundingRound(
      db,
      actor,
      {
        workspaceSlug,
        publicId,
        expectedRevision: 0,
        change: {
          section: "criteria",
          criteria: [
            { id: randomUUID(), title: "Community fit", description: "Community benefit" },
          ],
        },
      },
      noRoundCommitments,
    ),
  ).toEqual({ status: "ok", revision: 1 });
  return publicId;
});

it.for([
  "UPDATE criteria_versions SET version=version",
  "DELETE FROM criteria_versions",
  "UPDATE criteria_version_items SET title=title",
  "DELETE FROM criteria_version_items",
])("rejects mutation of recorded versions: %s", async (query, { db, database, criteriaRound }) => {
  const before = await readPersistedRound(db, criteriaRound);
  await expect(database.client.query(query)).rejects.toMatchObject({ code: "23514" });
  expect(await readPersistedRound(db, criteriaRound)).toEqual(before);
});

it("rejects adding criteria to a committed version", async ({ db, database, criteriaRound }) => {
  const before = await readPersistedRound(db, criteriaRound);
  await expect(
    database.client.query(
      "INSERT INTO criteria_version_items (round_id, version, position, criterion_id, title) VALUES ($1, 2, 1, $2, 'Extra')",
      [criteriaRound, randomUUID()],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  expect(await readPersistedRound(db, criteriaRound)).toEqual(before);
});
