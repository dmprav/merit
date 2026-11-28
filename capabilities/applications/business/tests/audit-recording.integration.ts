import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import type { IntakeChange } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { withAuditFailure, recordedEvents } from "@merit/audit/testing";
import type { Actor } from "@merit/auth";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

import { noApplicationWork } from "./application-test";
import { readPersistedApplication } from "./persisted-application";

const assistant: Actor = {
  userId: "dana",
  provenance: { interface: "mcp", clientId: "grant-assistant" },
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

const createRound = async (db: NodePgDatabase, as: Actor = actor) => {
  const round = await createFundingRound(db, as, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Neighbourhood grants",
  });
  assert(round.status === "ok");
  return { workspaceSlug, publicId: round.publicId };
};

const createApplication = async (
  db: NodePgDatabase,
  round: { publicId: string },
  overrides: Partial<Parameters<typeof createFundingApplication>[2]> = {},
) => {
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    ...content,
    ...overrides,
  });
  assert(created.status === "ok");
  return { workspaceSlug, publicId: created.publicId };
};

const intake = (db: NodePgDatabase, address: { workspaceSlug: string; publicId: string }) => {
  const revision = async () => (await readPersistedApplication(db, address.publicId))!.revision;

  const change = async (
    change: IntakeChange,
    options: { as?: Actor; expectedRevision?: number } = {},
  ) =>
    editFundingApplication(
      db,
      options.as ?? actor,
      { ...address, expectedRevision: options.expectedRevision ?? (await revision()), change },
      noApplicationWork,
    );

  return { change, revision };
};

it("records each persisted intake change once with its case revision", async ({ db, database }) => {
  const round = await createRound(db);
  const address = await createApplication(db, round);
  const id = address.publicId;
  const { change, revision } = intake(db, address);

  const events = (where = "target_type = 'application'") => recordedEvents(database.client, where);

  expect(await events()).toEqual([`application.created application/${id}@0`]);
  expect(
    (await database.client.query("SELECT * FROM audit_events WHERE target_type = 'application'"))
      .rows,
  ).toMatchObject([
    {
      organization_id: "alder",
      actor_user_id: "dana",
      actor_name: "Dana Reed",
      provenance: { interface: "web" },
    },
  ]);

  // Material and staff summary changes use the shared history.
  await change({ action: "save_content", content: { title: "Community meals together" } });
  await change({ action: "details", summary: "A strong local proposal." });
  expect(await events()).toEqual(
    [
      `application.created application/${id}@0`,
      `application.material_changed application/${id}@1`,
      `application.summary_changed application/${id}@2`,
    ].sort(),
  );

  const ready = await change({ action: "mark_ready" }, { as: assistant });
  assert(ready.status === "ok");
  expect(await events("action = 'application.marked_ready'")).toEqual([
    `application.marked_ready application/${id}@${ready.revision}`,
  ]);
  expect(
    (
      await database.client.query(
        "SELECT provenance FROM audit_events WHERE action = 'application.marked_ready'",
      )
    ).rows,
  ).toEqual([{ provenance: assistant.provenance }]);
  // An unchanged repeat keeps its revision and records nothing.
  expect(await change({ action: "mark_ready" })).toEqual({
    status: "ok",
    revision: ready.revision,
  });

  // Persisted working revision changes are recorded; replayed saves are not.
  await change({ action: "start_revision", kind: "revision" });
  await change({
    action: "save_revision",
    draft: { kind: "revision", reason: "Scope grew", content: { requested: "25000.00" } },
  });
  await change({ action: "discard_revision" });
  expect(await events()).toHaveLength(7);

  const published: Record<string, number> = {};
  for (const [kind, requested] of [
    ["revision", "25000.00"],
    ["correction", "26000.00"],
  ] as const) {
    await change({ action: "start_revision", kind });
    await change({
      action: "save_revision",
      draft: { kind, reason: "Updated request", content: { requested } },
    });
    const result = await change({ action: "publish_revision" });
    assert(result.status === "ok");
    published[kind] = result.revision;
  }
  expect(await events()).toEqual(
    [
      `application.created application/${id}@0`,
      `application.material_changed application/${id}@1`,
      `application.summary_changed application/${id}@2`,
      `application_working_revision.started application/${id}@4`,
      `application_working_revision.updated application/${id}@5`,
      `application_working_revision.discarded application/${id}@6`,
      `application_working_revision.started application/${id}@7`,
      `application_working_revision.updated application/${id}@8`,
      `application_working_revision.started application/${id}@10`,
      `application_working_revision.updated application/${id}@11`,
      `application.marked_ready application/${id}@${ready.revision}`,
      `application.revision_recorded application/${id}@${published.revision}`,
      `application.correction_recorded application/${id}@${published.correction}`,
    ].sort(),
  );
  expect(await revision()).toBe(published.correction);

  const deletable = await createApplication(db, round, { title: "Short-lived idea" });
  const removed = await intake(db, deletable).change({ action: "delete" });
  assert(removed.status === "ok");
  expect(await events(`target_id = '${deletable.publicId}'`)).toEqual([
    `application.created application/${deletable.publicId}@0`,
    `application.deleted application/${deletable.publicId}@${removed.revision}`,
  ]);
  expect(removed.revision).toBe(1);
});

it("records nothing for creation retries or rejected, conflicting and unauthorized intake writes", async ({
  db,
  database,
}) => {
  const round = await createRound(db);
  const request = {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    ...content,
  };
  const created = await createFundingApplication(db, actor, request);
  assert(created.status === "ok");
  expect(await createFundingApplication(db, actor, request)).toEqual(created);
  const address = { workspaceSlug, publicId: created.publicId };
  const { change } = intake(db, address);
  const before = await recordedEvents(database.client, "target_type = 'application'");
  expect(before).toHaveLength(1);

  expect(await change({ action: "mark_ready" }, { expectedRevision: 5 })).toEqual({
    status: "conflict",
  });
  expect(
    await createFundingApplication(db, actor, { ...request, requestId: randomUUID(), title: "" }),
  ).toEqual({ status: "invalid", error: "invalid_application" });
  expect(
    await createFundingApplication(
      db,
      { userId: "birch-manager" },
      { ...request, requestId: randomUUID() },
    ),
  ).toEqual({ status: "not_found" });
  expect(
    await editFundingApplication(
      db,
      { userId: "birch-manager" },
      { ...address, expectedRevision: 0, change: { action: "mark_ready" } },
      noApplicationWork,
    ),
  ).toEqual({ status: "not_found" });

  const incomplete = await createApplication(db, round, {
    title: "Incomplete",
    applicant: "",
    requested: "",
    answers: [],
  });
  const extra = await recordedEvents(database.client, "target_type = 'application'");
  expect(await intake(db, incomplete).change({ action: "mark_ready" })).toEqual({
    status: "invalid",
    error: "incomplete_application",
  });
  // A ready application is in use and cannot be deleted.
  await change({ action: "mark_ready" });
  const ready = await recordedEvents(database.client, "target_type = 'application'");
  expect(await change({ action: "delete" })).toEqual({
    status: "invalid",
    error: "application_in_use",
  });
  expect(await recordedEvents(database.client, "target_type = 'application'")).toEqual(ready);
  expect(extra).toHaveLength(before.length + 1);
  expect(ready).toHaveLength(extra.length + 1);
});

it("rolls back intake changes when the recorder fails after appending", async ({
  db,
  database,
}) => {
  const round = await createRound(db);
  const request = {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    ...content,
  };
  await expect(
    withAuditFailure(database.client, () => createFundingApplication(db, actor, request)),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect((await database.client.query("SELECT id FROM application_cases")).rows).toEqual([]);
  expect(
    (
      await database.client.query(
        "SELECT target_id FROM audit_events WHERE target_type='application'",
      )
    ).rows,
  ).toEqual([]);
  expect(await recordedEvents(database.client, "target_type = 'application'")).toEqual([]);

  const address = await createApplication(db, round);
  const { change, revision } = intake(db, address);
  await expect(
    withAuditFailure(database.client, () => change({ action: "mark_ready" })),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect(await revision()).toBe(0);
  expect(
    (
      await database.client.query("SELECT intake_status FROM application_cases WHERE id = $1", [
        address.publicId,
      ])
    ).rows,
  ).toEqual([{ intake_status: "in_preparation" }]);
  expect(await recordedEvents(database.client, "action = 'application.marked_ready'")).toEqual([]);
});
