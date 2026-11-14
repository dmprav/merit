import { drizzle } from "drizzle-orm/node-postgres";
import { Client as PgClient } from "pg";
import { assert, expect } from "vite-plus/test";

import {
  encodeApplicationDetail,
  encodeRoundSummary,
  decodeRoundSummary,
} from "@merit/grantmaking/api";
import {
  getFundingApplicationPage,
  getFundingRoundPage,
  listFundingRounds,
} from "@merit/grantmaking/server";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";

import { roundTest as it } from "./round-test";

it("reads committed data through a new connection", async ({ database, rounds: { pageInput } }) => {
  const fresh = new PgClient({ connectionString: database.connectionString });

  try {
    await fresh.connect();

    expect(
      encodeMoney(
        (await getFundingRoundPage(drizzle(fresh), actor, pageInput))!.round.totals.remaining!,
      ).minorUnits,
    ).toBe("10000");
  } finally {
    await fresh.end();
  }
});

it("scopes permanent round identities to their workspace even when titles match", async ({
  db,
  rounds: { pageInput },
}) => {
  const birchActor = { userId: "birch-manager" };
  const listed = await listFundingRounds(db, birchActor, "birch");
  assert(listed.status === "ok");
  const [birch] = listed.rounds;
  assert.isDefined(birch);
  expect(birch.publicId).not.toBe(pageInput.publicId);
  const birchInput = {
    workspaceSlug: "birch",
    publicId: birch.publicId,
    kind: "round" as const,
  };

  expect((await getFundingRoundPage(db, actor, pageInput))?.round.foundation).toBe(
    "Alder Foundation",
  );
  expect(await getFundingRoundPage(db, actor, birchInput)).toBeNull();
  expect(await getFundingRoundPage(db, actor, { ...pageInput, workspaceSlug: "birch" })).toBeNull();
  expect(
    await getFundingRoundPage(db, actor, { ...pageInput, publicId: "000000000000" }),
  ).toBeNull();
  expect(await getFundingRoundPage(db, { userId: "unmapped" }, pageInput)).toBeNull();
  expect((await getFundingRoundPage(db, birchActor, birchInput))?.round.foundation).toBe(
    "Birch Foundation",
  );
  expect(await listFundingRounds(db, actor, "alder")).toEqual({
    status: "ok",
    rounds: [expect.objectContaining({ organizationId: "alder" })],
  });
});

it("uses one application identity and rejects a round from another workspace", async ({
  db,
  database,
  rounds: { pageInput, createApplication },
}) => {
  const application = await createApplication("Alder project");
  const birch = await listFundingRounds(db, { userId: "birch-manager" }, "birch");
  assert(birch.status === "ok" && birch.rounds[0]);

  await expect(
    database.client.query("UPDATE application_cases SET round_id = $1 WHERE id = $2", [
      birch.rounds[0].publicId,
      application.publicId,
    ]),
  ).rejects.toMatchObject({ code: "23503" });

  const page = await getFundingApplicationPage(db, actor, application);
  expect(page).toMatchObject({
    application: { id: application.publicId },
    round: { id: pageInput.publicId },
  });
  expect(
    (
      await database.client.query("SELECT id, round_id FROM application_cases WHERE id = $1", [
        application.publicId,
      ])
    ).rows,
  ).toEqual([{ id: application.publicId, round_id: pageInput.publicId }]);
});

it("validates persisted JSON instead of trusting inferred database types", async ({
  db,
  database,
  rounds: { pageInput },
}) => {
  await database.client.query(
    `WITH inserted AS (
      INSERT INTO criteria_versions (round_id, version, criteria)
      SELECT id, criteria_version + 1, '["Unstructured criteria"]'::jsonb FROM funding_rounds WHERE organization_id='alder'
      RETURNING round_id, version
    ) UPDATE funding_rounds SET criteria_version=inserted.version FROM inserted WHERE funding_rounds.id=inserted.round_id`,
  );

  await expect(getFundingRoundPage(db, actor, pageInput)).rejects.toThrow();
});

it("reads one application with round-wide budget context without decoding sibling content", async ({
  db,
  database,
  rounds: { createApplication, recommendApplication },
}) => {
  const selected = await createApplication("Selected application");
  const sibling = await createApplication("Sibling application");
  await recommendApplication(sibling, "3000");
  const original = await getFundingApplicationPage(db, actor, selected);
  assert.isNotNull(original);

  await database.client.query(
    "UPDATE application_cases SET attention = '{}'::jsonb WHERE id = $1",
    [sibling.publicId],
  );
  const detail = await getFundingApplicationPage(db, actor, selected);
  assert.isNotNull(detail);

  expect(encodeApplicationDetail(detail)).toEqual(encodeApplicationDetail(original));
  expect(encodeApplicationDetail(detail).round).toMatchObject({
    budget: { currency: "EUR", minorUnits: "10000" },
    totals: {
      proposed: { currency: "EUR", minorUnits: "3000" },
      remaining: { currency: "EUR", minorUnits: "7000" },
    },
  });
  expect(detail.round).not.toHaveProperty("applications");
  expect(detail.application.id).toBe(selected.publicId);
  expect(detail.recommendationVersion).toBe(0);
});

it("returns exact metadata and tenant-scoped counts without reading application contents", async ({
  db,
  database,
  rounds: { createApplication },
}) => {
  await createApplication("First application");
  await createApplication("Second application");
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ('birch', 'dana', 'program_manager')",
  );
  await database.client.query("DELETE FROM application_cases WHERE organization_id = 'birch'");
  await database.client.query(
    "UPDATE application_cases SET attention = '{}'::jsonb WHERE organization_id = 'alder'",
  );
  const alderResult = await listFundingRounds(db, actor, "alder");
  const birchResult = await listFundingRounds(db, actor, "birch");
  assert(alderResult.status === "ok" && birchResult.status === "ok");
  const summaries = alderResult.rounds;
  const birch = birchResult.rounds;

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toMatchObject({ organizationId: "alder", applicationCount: 2 });
  expect(birch).toHaveLength(1);
  expect(birch[0]).toMatchObject({ organizationId: "birch", applicationCount: 0 });
  expect((summaries[0] ?? assert.fail("Expected summaries[0]")).publicId).not.toBe(
    (birch[0] ?? assert.fail("Expected birch[0]")).publicId,
  );
  expect(encodeRoundSummary(summaries[0] ?? assert.fail("Expected summaries[0]"))).toMatchObject({
    title: "Community grants",
    meetingDate: "2027-04-15",
    decisionStatus: "Preparing",
    manager: "Dana Reed",
    managerNeedsReassignment: false,
    budget: { currency: "EUR", minorUnits: "10000" },
  });
  expect(
    decodeRoundSummary(encodeRoundSummary(summaries[0] ?? assert.fail("Expected summaries[0]"))),
  ).toEqual(summaries[0]);
});

it("rejects invalid calendar dates at the normalized storage boundary", async ({ database }) => {
  await expect(
    database.client.query(
      "UPDATE funding_rounds SET meeting_date = '2027-02-30' WHERE organization_id = 'alder'",
    ),
  ).rejects.toMatchObject({ code: "22008" });
});

it("rejects invalid budgets at the normalized storage boundary", async ({ database }) => {
  await expect(
    database.client.query("UPDATE funding_rounds SET budget = -1 WHERE organization_id = 'alder'"),
  ).rejects.toThrow();
});
