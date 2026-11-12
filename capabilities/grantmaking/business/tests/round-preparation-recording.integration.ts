import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { roundHasApplications } from "@merit/applications/server/integrations";
import { getFundingRoundPage } from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound, deleteFundingRound, editFundingRound } from "@merit/rounds/server";

it.for(["criteria_versions", "round_changes"])(
  "rolls back round creation and its retry receipt when %s cannot be recorded",
  async (table, { db, database }) => {
    const request = { workspaceSlug, requestId: randomUUID(), title: "Neighbourhood grants" };
    await database.client.query(
      `ALTER TABLE ${table} ADD CONSTRAINT reject_preparation_recording CHECK (false) NOT VALID`,
    );
    try {
      await expect(createFundingRound(db, actor, request)).rejects.toThrow();
      expect((await database.client.query("SELECT id FROM funding_rounds")).rows).toEqual([]);
      expect((await database.client.query("SELECT round_id FROM criteria_versions")).rows).toEqual(
        [],
      );
      expect((await database.client.query("SELECT round_id FROM round_changes")).rows).toEqual([]);
    } finally {
      await database.client.query(
        `ALTER TABLE ${table} DROP CONSTRAINT reject_preparation_recording`,
      );
    }

    const created = await createFundingRound(db, actor, request);
    expect(created.status).toBe("ok");
    expect(await createFundingRound(db, actor, request)).toEqual(created);
    expect((await database.client.query("SELECT action FROM round_changes")).rows).toEqual([
      { action: "create" },
    ]);
  },
);

it.for(["criteria_versions", "round_changes"])(
  "rolls back preparation, revision, criteria versions, and history when %s cannot be recorded",
  async (table, { db, database }) => {
    const created = await createFundingRound(db, actor, {
      workspaceSlug,
      requestId: randomUUID(),
      title: "Neighbourhood grants",
    });
    assert(created.status === "ok");
    const address = { workspaceSlug, publicId: created.publicId };
    const before = await getFundingRoundPage(db, actor, { ...address, kind: "round" });
    const history = (await database.client.query("SELECT * FROM round_changes")).rows;

    await database.client.query(
      `ALTER TABLE ${table} ADD CONSTRAINT reject_preparation_recording CHECK (false) NOT VALID`,
    );
    try {
      await expect(
        editFundingRound(db, actor, {
          ...address,
          expectedRevision: 0,
          change: {
            section: "criteria",
            criteria: [
              {
                id: "69ab841a-4705-57f6-aa41-875e8fa4ad4a",
                title: "Fit",
                description: "Community benefit",
              },
            ],
          },
        }),
      ).rejects.toThrow();
      expect(await getFundingRoundPage(db, actor, { ...address, kind: "round" })).toEqual(before);
      expect((await database.client.query("SELECT * FROM round_changes")).rows).toEqual(history);
      expect(
        (await database.client.query("SELECT version, criteria FROM criteria_versions")).rows,
      ).toEqual([{ version: 1, criteria: [] }]);
    } finally {
      await database.client.query(
        `ALTER TABLE ${table} DROP CONSTRAINT reject_preparation_recording`,
      );
    }
  },
);

it("rolls back deletion history when removing the round fails", async ({ db, database }) => {
  const request = { workspaceSlug, requestId: randomUUID(), title: "Neighbourhood grants" };
  const created = await createFundingRound(db, actor, request);
  assert(created.status === "ok");
  const address = { workspaceSlug, publicId: created.publicId };
  const before = await getFundingRoundPage(db, actor, { ...address, kind: "round" });
  const history = (await database.client.query("SELECT * FROM round_changes")).rows;

  await database.client.query(`
    CREATE FUNCTION reject_round_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Round deletion unavailable'; END; $$;
    CREATE TRIGGER reject_round_deletion BEFORE DELETE ON funding_rounds
    FOR EACH ROW EXECUTE FUNCTION reject_round_deletion();
  `);
  try {
    await expect(
      deleteFundingRound(db, actor, { ...address, expectedRevision: 0 }, roundHasApplications),
    ).rejects.toThrow();
    expect(await getFundingRoundPage(db, actor, { ...address, kind: "round" })).toEqual(before);
    expect((await database.client.query("SELECT * FROM round_changes")).rows).toEqual(history);
    expect(await createFundingRound(db, actor, request)).toEqual(created);
  } finally {
    await database.client.query("DROP TRIGGER reject_round_deletion ON funding_rounds");
    await database.client.query("DROP FUNCTION reject_round_deletion()");
  }
});

it("records preparation snapshots with their action, reason, actor, and verified client", async ({
  db,
  database,
}) => {
  const recorder = {
    ...actor,
    provenance: { interface: "mcp", clientId: "preparation-client" },
  } as const;
  const request = {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Neighbourhood grants",
    budget: "100.25",
  };
  const created = await createFundingRound(db, recorder, request);
  assert(created.status === "ok");
  const address = { workspaceSlug, publicId: created.publicId };
  expect(
    await editFundingRound(db, recorder, {
      ...address,
      expectedRevision: 0,
      change: { section: "budget", amount: "200.50", reason: "Additional allocation" },
    }),
  ).toEqual({ status: "ok", revision: 1 });

  await database.client.query("INSERT INTO app_users (id, name) VALUES ('pat', 'Pat Taylor')");
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'pat', 'program_manager')",
  );
  expect(
    await editFundingRound(db, recorder, {
      ...address,
      expectedRevision: 1,
      change: { section: "manager", userId: "pat" },
    }),
  ).toEqual({ status: "ok", revision: 2 });
  expect(
    await deleteFundingRound(
      db,
      recorder,
      { ...address, expectedRevision: 2 },
      roundHasApplications,
    ),
  ).toEqual({
    status: "ok",
  });

  const { rows } = await database.client.query<{ actor_user_id: string; provenance: unknown }>(
    "SELECT revision, action, reason, request_id, actor_user_id, provenance, before, after FROM round_changes ORDER BY revision",
  );
  expect(rows).toMatchObject([
    {
      revision: 0,
      action: "create",
      request_id: request.requestId,
      before: null,
      after: {
        id: created.publicId,
        budget: { minorUnits: "10025", currency: "EUR" },
        criteriaVersion: 1,
      },
    },
    {
      revision: 1,
      action: "budget",
      reason: "Additional allocation",
      request_id: null,
      before: { budget: { minorUnits: "10025", currency: "EUR" }, managerUserId: "dana" },
      after: { budget: { minorUnits: "20050", currency: "EUR" }, managerUserId: "dana" },
    },
    {
      revision: 2,
      action: "manager",
      reason: null,
      request_id: null,
      before: { manager: "Dana Reed", managerUserId: "dana" },
      after: { manager: "Pat Taylor", managerUserId: "pat" },
    },
    {
      revision: 3,
      action: "delete",
      reason: null,
      request_id: null,
      before: {
        manager: "Pat Taylor",
        managerUserId: "pat",
        budget: { minorUnits: "20050", currency: "EUR" },
      },
      after: null,
    },
  ]);
  expect(rows.map(({ actor_user_id, provenance }) => ({ actor_user_id, provenance }))).toEqual(
    Array.from({ length: 4 }, () => ({
      actor_user_id: actor.userId,
      provenance: recorder.provenance,
    })),
  );
  expect(await createFundingRound(db, recorder, request)).toEqual({
    status: "invalid",
    error: "round_deleted",
  });
});
