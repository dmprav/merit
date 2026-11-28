import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { withAuditFailure, recordedEvents } from "@merit/audit/testing";
import type { Actor } from "@merit/auth";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import type { RoundChange } from "@merit/rounds/domain";
import { createFundingRound, deleteFundingRound, editFundingRound } from "@merit/rounds/server";

import { noRoundApplications, noRoundCommitments, readPersistedRound } from "./persisted-round";

const assistant: Actor = {
  userId: "dana",
  provenance: { interface: "mcp", clientId: "grant-assistant" },
};

const createRound = async (db: NodePgDatabase, as: Actor = actor) => {
  const round = await createFundingRound(db, as, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Neighbourhood grants",
  });
  assert(round.status === "ok");
  return { workspaceSlug, publicId: round.publicId };
};

const roundChange = (
  db: NodePgDatabase,
  address: { workspaceSlug: string; publicId: string },
  options: { as?: Actor } = {},
) => {
  const revision = async () => (await readPersistedRound(db, address.publicId)).round!.revision;

  const edit = async (change: RoundChange, expectedRevision?: number) =>
    editFundingRound(
      db,
      options.as ?? actor,
      {
        ...address,
        expectedRevision: expectedRevision ?? (await revision()),
        change,
      },
      noRoundCommitments,
    );

  return { edit, revision };
};

it("records all round preparation changes, including details", async ({ db, database }) => {
  await database.client.query("INSERT INTO app_users (id, name) VALUES ('pat', 'Pat Taylor')");
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'pat', 'program_manager')",
  );
  const address = await createRound(db, assistant);
  const id = address.publicId;
  const { edit } = roundChange(db, address);

  const events = (where = `target_id = '${id}'`) => recordedEvents(database.client, where);

  expect(await events()).toEqual([`round.created round/${id}@0`]);
  expect(
    (await database.client.query("SELECT * FROM audit_events WHERE target_id = $1", [id])).rows,
  ).toMatchObject([
    {
      organization_id: "alder",
      actor_user_id: "dana",
      actor_name: "Dana Reed",
      provenance: assistant.provenance,
      target_type: "round",
      target_revision: 0,
    },
  ]);

  await edit({ section: "details", title: "Renamed grants", purpose: "New purpose" });
  expect(await events()).toHaveLength(2);

  const budget = await edit({ section: "budget", amount: "5000.00", reason: "" });
  const criteria = await edit({
    section: "criteria",
    criteria: [{ id: randomUUID(), title: "Impact", description: "" }],
  });
  const manager = await edit({ section: "manager", userId: "pat" });
  assert(budget.status === "ok" && criteria.status === "ok" && manager.status === "ok");
  // Repeating a change keeps the revision and records nothing more.
  expect(await edit({ section: "manager", userId: "pat" })).toEqual(manager);
  expect(await edit({ section: "budget", amount: "5000.00", reason: "" })).toEqual(manager);
  expect(await events()).toEqual(
    [
      `round.created round/${id}@0`,
      `round.details_changed round/${id}@1`,
      `round.budget_changed round/${id}@${budget.revision}`,
      `round.criteria_changed round/${id}@${criteria.revision}`,
      `round.manager_changed round/${id}@${manager.revision}`,
    ].sort(),
  );

  const empty = await createRound(db);
  const current = await roundChange(db, empty).revision();
  expect(
    await deleteFundingRound(
      db,
      actor,
      { ...empty, expectedRevision: current },
      noRoundApplications,
    ),
  ).toEqual({ status: "ok" });
  expect(await events(`target_id = '${empty.publicId}'`)).toEqual([
    `round.created round/${empty.publicId}@0`,
    `round.deleted round/${empty.publicId}@${current + 1}`,
  ]);
});

it("records nothing for rejected, conflicting or blocked round writes and rolls back with the recorder", async ({
  db,
  database,
}) => {
  const address = await createRound(db);
  const { edit, revision } = roundChange(db, address);
  const baseline = await recordedEvents(database.client, "target_type = 'round'");
  expect(baseline).toHaveLength(1);

  expect(await edit({ section: "budget", amount: "10.00", reason: "" }, 9)).toEqual({
    status: "conflict",
  });
  expect(await edit({ section: "manager", userId: "birch-manager" })).toEqual({
    status: "invalid",
    error: "manager_unavailable",
  });
  expect(
    await roundChange(db, address, { as: { userId: "birch-manager" } }).edit(
      { section: "budget", amount: "10.00", reason: "" },
      0,
    ),
  ).toEqual({ status: "not_found" });
  expect(
    await createFundingRound(db, actor, { workspaceSlug, requestId: randomUUID(), title: "" }),
  ).toEqual({ status: "invalid", error: "invalid_round" });
  expect(
    await deleteFundingRound(
      db,
      actor,
      { ...address, expectedRevision: await revision() },
      async () => true,
    ),
  ).toEqual({ status: "invalid", error: "round_not_empty" });
  expect(await recordedEvents(database.client, "target_type = 'round'")).toEqual(baseline);

  const rolledBack = roundChange(db, address);
  await expect(
    withAuditFailure(database.client, () =>
      rolledBack.edit({ section: "budget", amount: "10.00", reason: "" }),
    ),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect(await revision()).toBe(0);
  await expect(
    withAuditFailure(database.client, () =>
      createFundingRound(db, actor, {
        workspaceSlug,
        requestId: randomUUID(),
        title: "Never saved",
      }),
    ),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect((await database.client.query("SELECT id FROM funding_rounds")).rows).toHaveLength(1);

  const doomed = await createRound(db);
  await expect(
    withAuditFailure(database.client, () =>
      deleteFundingRound(db, actor, { ...doomed, expectedRevision: 0 }, noRoundApplications),
    ),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect(
    (await database.client.query("SELECT id FROM funding_rounds WHERE id = $1", [doomed.publicId]))
      .rows,
  ).toHaveLength(1);
});
