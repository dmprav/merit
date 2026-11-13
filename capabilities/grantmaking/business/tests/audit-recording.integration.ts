import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema, type IntakeChange } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import type { Actor } from "@merit/auth";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { getFundingApplicationPage, getFundingRoundPage } from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import {
  reviewRevisionSchema,
  type ReviewChange,
  type ReviewRevision,
} from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema, type RoundChange } from "@merit/rounds/domain";
import { createFundingRound, deleteFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";
import { withAuditFailure, recordedEvents } from "./audit-events";

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
  const revision = async () =>
    (await getFundingApplicationPage(db, actor, address))!.intake.revision;

  const change = async (
    change: IntakeChange,
    options: { as?: Actor; expectedRevision?: number } = {},
  ) =>
    editFundingApplication(
      db,
      options.as ?? actor,
      { ...address, expectedRevision: options.expectedRevision ?? (await revision()), change },
      applicationWork,
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
      applicationWork,
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

const roundChange = (
  db: NodePgDatabase,
  address: { workspaceSlug: string; publicId: string },
  options: { as?: Actor } = {},
) => {
  const revision = async () =>
    (await getFundingRoundPage(db, actor, { ...address, kind: "round" }))!.preparation.revision;

  const edit = async (change: RoundChange, expectedRevision?: number) =>
    editFundingRound(db, options.as ?? actor, {
      ...address,
      expectedRevision: expectedRevision ?? (await revision()),
      change,
    });

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
      roundHasApplications,
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
  await createApplication(db, address);
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
      roundHasApplications,
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
      deleteFundingRound(db, actor, { ...doomed, expectedRevision: 0 }, roundHasApplications),
    ),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect(
    (await database.client.query("SELECT id FROM funding_rounds WHERE id = $1", [doomed.publicId]))
      .rows,
  ).toHaveLength(1);
});

const assessmentScenario = async (db: NodePgDatabase) => {
  const round = await createRound(db);
  const address = await createApplication(db, round);

  const contact = async (name: string) => {
    const created = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        action: "create",
        contactId: randomUUID(),
        details: { name, email: "", affiliation: "" },
      },
      fundingRoundContactUsage,
    );
    assert(created.status === "ok");
    return created.contact;
  };

  const review = async (
    change: ReviewChange,
    options: {
      as?: Actor;
      expectedRevision?: ReviewRevision;
    } = {},
  ) => {
    const page = (await getFundingApplicationPage(db, actor, address))!;
    return saveApplicationReview(db, options.as ?? actor, {
      ...address,
      expectedRevision: options.expectedRevision ?? page.application.reviews.revision,
      expectedApplicationVersion: page.application.version,
      expectedCriteriaVersion: page.round.criteriaVersion,
      change,
    });
  };

  const assessment = {
    applicationVersion: materialVersionSchema.parse(1),
    criteriaVersion: criteriaVersionSchema.parse(1),
    date: null,
    position: "Fund" as const,
    amount: "18000",
    reasoning: "Practical plan with a confirmed free venue.",
    observations: [],
  };
  return { address, contact, review, assessment };
};

it("records each saved assessment version on the assessment, not review requests", async ({
  db,
  database,
}) => {
  const { contact, review, assessment } = await assessmentScenario(db);
  const sam = await contact("Sam");

  const events = () => recordedEvents(database.client, "target_type = 'assessment'");

  // Requests and cancellations are not assessments.
  const requestId = randomUUID();
  await review({ action: "request", id: requestId, contactId: sam.id, replacesId: null });
  await review({ action: "cancel", id: requestId });
  expect(await events()).toEqual([]);

  const id = randomUUID();
  const record: ReviewChange = {
    action: "record",
    id,
    contactId: sam.id,
    requestId: null,
    previousId: null,
    content: assessment,
  };
  expect(await review(record, { as: assistant })).toMatchObject({ status: "ok" });
  expect(await events()).toEqual([`assessment.recorded assessment/${id}@1`]);
  expect(
    (await database.client.query("SELECT * FROM audit_events WHERE target_type = 'assessment'"))
      .rows,
  ).toMatchObject([
    {
      organization_id: "alder",
      actor_user_id: "dana",
      actor_name: "Dana Reed",
      provenance: assistant.provenance,
      target_revision: 1,
    },
  ]);

  // A retry of the same creation neither appends a judgment nor an event.
  await review(record);
  expect(await events()).toHaveLength(1);

  const edited = { ...assessment, reasoning: "Reconsidered after the site visit." };
  expect(await review({ action: "edit", id, content: edited, note: "Site visit" })).toMatchObject({
    status: "ok",
  });
  // An edit that changes nothing creates no version and no event.
  await review({ action: "edit", id, content: edited, note: "" });
  expect(await events()).toEqual(
    [`assessment.recorded assessment/${id}@1`, `assessment.corrected assessment/${id}@2`].sort(),
  );
});

it("records no assessment event for rejected or conflicting reviews, and rolls back with the recorder", async ({
  db,
  database,
}) => {
  const { contact, review, assessment } = await assessmentScenario(db);
  const sam = await contact("Sam");

  const input = (id = randomUUID()): Extract<ReviewChange, { action: "record" }> => ({
    action: "record",
    id,
    contactId: sam.id,
    requestId: null,
    previousId: null,
    content: assessment,
  });

  expect(await review(input(), { expectedRevision: reviewRevisionSchema.parse(5) })).toEqual({
    status: "conflict",
  });
  expect(
    await review({
      ...input(),
      content: { ...assessment, applicationVersion: materialVersionSchema.parse(9) },
    }),
  ).toEqual({ status: "invalid", error: "version_unavailable" });
  expect(await review(input(), { as: { userId: "birch-manager" } })).toEqual({
    status: "not_found",
  });
  const failed = randomUUID();
  await expect(
    withAuditFailure(database.client, () => review(input(failed))),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect(await recordedEvents(database.client, "target_type = 'assessment'")).toEqual([]);
  expect((await database.client.query("SELECT id FROM assessments")).rows).toEqual([]);
  expect((await database.client.query("SELECT case_id FROM review_states")).rows).toEqual([]);
});
