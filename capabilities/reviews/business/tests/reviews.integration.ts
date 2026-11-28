import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { Client } from "pg";
import { expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationTest } from "@merit/applications/testing";
import { withAuditFailure, recordedEvents } from "@merit/audit/testing";
import type { Actor } from "@merit/auth";
import { actor } from "@merit/organizations/testing/workspace";
import {
  assessmentEntrySchema,
  emptyReviews,
  reviewRevisionSchema,
  type ReviewChange,
  type ReviewRevision,
} from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { readReviewsByCasesMap } from "../src/server/persistence/projections";
import { contact, content, unknownBasisRecord } from "./assessment-test";

const readApplicationCase = async (client: Client, publicId: string) =>
  (
    await client.query<Record<string, unknown>>("SELECT * FROM application_cases WHERE id = $1", [
      publicId,
    ])
  ).rows;

const it = applicationTest.extend("reviewCase", async ({ db, applications }) => {
  const address = await applications.createApplication("Workshop Saturdays");

  const read = async () =>
    (await readReviewsByCasesMap(db, [address.publicId])).get(address.publicId) ?? emptyReviews();

  const review = async (
    change: ReviewChange,
    options: { as?: Actor; expectedRevision?: ReviewRevision } = {},
  ) =>
    saveApplicationReview(db, options.as ?? actor, {
      ...address,
      change,
      expectedRevision: options.expectedRevision ?? (await read()).revision,
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
    });

  return { address, read, review };
});

it("round-trips unstated, zero, and fractional-euro amounts through assessment history", async ({
  db,
  reviewCase,
}) => {
  const { read, review } = reviewCase;
  const sam = await contact(db);
  const id = randomUUID();

  const entered = (amount: string | null) =>
    assessmentEntrySchema.parse({ ...content, position: null, amount });

  expect(
    await review({
      action: "record",
      id,
      contactId: sam.id,
      requestId: null,
      previousId: null,
      content: entered(null),
    }),
  ).toMatchObject({ status: "ok" });
  for (const amount of ["0", "12.30", "9999999999999999999999999999.99"]) {
    expect(await review({ action: "edit", id, note: "", content: entered(amount) })).toMatchObject({
      status: "ok",
    });
  }

  const { versions } = (await read()).assessments[0]!;
  expect(versions.map(({ content }) => content.amount)).toEqual([
    null,
    { minorUnits: "0", currency: "EUR" },
    { minorUnits: "1230", currency: "EUR" },
    { minorUnits: "9".repeat(30), currency: "EUR" },
  ]);
});

it("writes only a new correction version and leaves unrelated reviews untouched", async ({
  db,
  database,
  reviewCase,
}) => {
  const { read, review } = reviewCase;
  const sam = await contact(db);
  const jules = await contact(db, "Jules");
  const assessmentId = randomUUID();
  expect(
    await review({
      action: "record",
      id: assessmentId,
      contactId: sam.id,
      requestId: null,
      previousId: null,
      content,
    }),
  ).toEqual({ status: "ok", revision: 1 });
  expect(
    await review({ action: "request", id: randomUUID(), contactId: jules.id, replacesId: null }),
  ).toEqual({ status: "ok", revision: 2 });
  const before = await read();

  await database.client.query(`
    CREATE TABLE review_write_probe (event text NOT NULL);
    CREATE FUNCTION record_review_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO review_write_probe VALUES (TG_TABLE_NAME || ':' || TG_OP);
      RETURN NEW;
    END $$;
  `);
  const tables = [
    "review_requests",
    "assessments",
    "assessment_versions",
    "application_cases",
    "review_states",
  ];
  try {
    for (const table of tables) {
      await database.client
        .query(`CREATE TRIGGER record_review_write BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION record_review_write()`);
    }
    const correction: ReviewChange = {
      action: "edit",
      id: assessmentId,
      note: "",
      content: { ...content, reasoning: "Corrected transcription." },
    };
    expect(await review(correction)).toEqual({ status: "ok", revision: 3 });
    const writes = await database.client.query<{ event: string }>(
      "SELECT event FROM review_write_probe ORDER BY event",
    );
    expect(writes.rows.map((row) => row.event)).toEqual([
      "assessment_versions:INSERT",
      "review_states:INSERT",
      "review_states:UPDATE",
    ]);
    const after = await read();
    expect(after.requests).toEqual(before.requests);
    expect(after.assessments[0]?.versions).toEqual([
      ...before.assessments[0]!.versions,
      expect.objectContaining({ content: correction.content }),
    ]);

    await database.client.query("TRUNCATE review_write_probe");
    expect(await review(correction)).toEqual({ status: "ok", revision: 3 });
    expect((await database.client.query("SELECT * FROM review_write_probe")).rows).toEqual([]);
    expect(await read()).toEqual(after);
  } finally {
    for (const table of tables) {
      await database.client.query(`DROP TRIGGER IF EXISTS record_review_write ON ${table}`);
    }
    await database.client.query(
      "DROP FUNCTION record_review_write(); DROP TABLE review_write_probe",
    );
  }
});

it("rolls back receiving a request when recording its assessment version fails", async ({
  db,
  database,
  reviewCase,
}) => {
  const { read, review } = reviewCase;
  const sam = await contact(db);
  const requestId = randomUUID();
  expect(
    await review({ action: "request", id: requestId, contactId: sam.id, replacesId: null }),
  ).toEqual({ status: "ok", revision: 1 });
  const before = await read();
  const application = await readApplicationCase(database.client, reviewCase.address.publicId);
  await database.client.query(`
    CREATE FUNCTION reject_assessment_version() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Version storage unavailable'; END $$;
    CREATE TRIGGER reject_assessment_version BEFORE INSERT ON assessment_versions
    FOR EACH ROW EXECUTE FUNCTION reject_assessment_version();
  `);
  try {
    await expect(
      review({
        action: "record",
        id: randomUUID(),
        contactId: sam.id,
        requestId,
        previousId: null,
        content,
      }),
    ).rejects.toMatchObject({ cause: { message: "Version storage unavailable" } });
    expect(await read()).toEqual(before);
    expect(await readApplicationCase(database.client, reviewCase.address.publicId)).toEqual(
      application,
    );
  } finally {
    await database.client.query(
      "DROP TRIGGER reject_assessment_version ON assessment_versions; DROP FUNCTION reject_assessment_version()",
    );
  }
});

it.for(["request", "record"] as const)(
  "retries a completed review %s with its original baseline without changing history",
  async (action, { db, reviewCase }) => {
    const { address, read } = reviewCase;
    const sam = await contact(db);
    const id = randomUUID();
    const change: ReviewChange =
      action === "request"
        ? { action, id, contactId: sam.id, replacesId: null }
        : { action, id, contactId: sam.id, requestId: null, previousId: null, content };
    const request = {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change,
    };
    const first = await saveApplicationReview(db, actor, request);
    expect(first).toEqual({ status: "ok", revision: 1 });
    const before = await read();

    expect(await saveApplicationReview(db, actor, request)).toEqual(first);
    expect(await read()).toEqual(before);
  },
);

it.for([
  { denial: "another workspace's manager", as: { userId: "birch-manager" }, revoke: false },
  { denial: "a member without grant access", as: actor, revoke: true },
])(
  "rejects a review save by $denial without recording it",
  async ({ as, revoke }, { db, database, reviewCase }) => {
    const { address } = reviewCase;
    const sam = await contact(db);
    if (revoke) {
      await database.client.query(
        "UPDATE memberships SET role = 'member' WHERE user_id = 'dana' AND organization_id = 'alder'",
      );
    }

    expect(
      await saveApplicationReview(db, as, {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
        change: unknownBasisRecord(sam.id),
      }),
    ).toEqual({ status: "not_found" });
    expect((await database.client.query("SELECT id FROM assessments")).rows).toEqual([]);
    expect((await database.client.query("SELECT 1 FROM assessment_versions")).rows).toEqual([]);
  },
);

it.for([
  { expectedApplicationVersion: 2, expectedCriteriaVersion: 1 },
  { expectedApplicationVersion: 1, expectedCriteriaVersion: 2 },
])(
  "rejects a request based on application version $expectedApplicationVersion and criteria version $expectedCriteriaVersion when either is stale",
  async (basis, { db, database, reviewCase: { address, read } }) => {
    const sam = await contact(db);
    const before = await read();

    const stored = await readApplicationCase(database.client, address.publicId);
    expect(
      await saveApplicationReview(db, actor, {
        ...address,
        expectedRevision: before.revision,
        expectedApplicationVersion: materialVersionSchema.parse(basis.expectedApplicationVersion),
        expectedCriteriaVersion: criteriaVersionSchema.parse(basis.expectedCriteriaVersion),
        change: { action: "request", id: randomUUID(), contactId: sam.id, replacesId: null },
      }),
    ).toEqual({ status: "conflict" });
    expect(await read()).toEqual(before);
    expect(await readApplicationCase(database.client, address.publicId)).toEqual(stored);
  },
);

it("rejects an assessment edit made against a stale review revision", async ({
  db,
  reviewCase,
}) => {
  const { address, read, review } = reviewCase;
  const sam = await contact(db);
  const change = unknownBasisRecord(sam.id);
  expect(await review(change)).toEqual({ status: "ok", revision: 1 });
  const before = await read();

  expect(
    await saveApplicationReview(db, actor, {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: { action: "edit", id: change.id, content, note: "" },
    }),
  ).toEqual({ status: "conflict" });
  expect(await read()).toEqual(before);
});

it("rejects an assessment basis naming an application version that was never recorded", async ({
  db,
  reviewCase,
}) => {
  const { read, review } = reviewCase;
  const sam = await contact(db);
  const change = unknownBasisRecord(sam.id);
  expect(await review(change)).toEqual({ status: "ok", revision: 1 });
  const before = await read();

  expect(
    await review({
      action: "edit",
      id: change.id,
      content: { ...content, applicationVersion: materialVersionSchema.parse(99) },
      note: "",
    }),
  ).toEqual({ status: "invalid", error: "version_unavailable" });
  expect(await read()).toEqual(before);
});

it("records reviews using version references without decoding application content or reading recommendations", async ({
  db,
  reviewCase,
}) => {
  const { address } = reviewCase;
  const sam = await contact(db);
  const role = `review_state_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("Remove the temporary role and grants");
  const requestId = randomUUID();
  const assessmentId = randomUUID();

  await expect(
    db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(
          `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        ),
      );
      await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
      await tx.execute(
        sql.raw(
          `GRANT SELECT ON app_users, memberships, organizations, application_cases, criteria_versions, criteria_version_items, review_states, review_requests, review_assignments, assessments, assessment_versions, assessment_version_observations, contacts TO ${role}`,
        ),
      );
      await tx.execute(
        sql.raw(
          `GRANT SELECT (id, organization_id, criteria_version) ON funding_rounds TO ${role}`,
        ),
      );
      await tx.execute(
        sql.raw(`GRANT SELECT (case_id, version, title) ON material_versions TO ${role}`),
      );
      await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
      // PostgreSQL requires a column UPDATE grant to take a row lock for a snapshot.
      await tx.execute(
        sql.raw(`GRANT UPDATE (id) ON funding_rounds, app_users, contacts TO ${role}`),
      );
      await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (id) ON application_cases TO ${role}`));
      await tx.execute(
        sql.raw(
          `GRANT INSERT ON assessments, assessment_versions, assessment_version_observations TO ${role}`,
        ),
      );
      await tx.execute(sql.raw(`GRANT SELECT, INSERT ON audit_events TO ${role}`));
      await tx.execute(
        sql.raw(`GRANT INSERT, UPDATE ON review_states, review_requests TO ${role}`),
      );
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      const baseline = {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      };

      expect(
        await saveApplicationReview(tx, actor, {
          ...baseline,
          change: { action: "request", id: requestId, contactId: sam.id, replacesId: null },
        }),
      ).toEqual({ status: "ok", revision: 1 });
      expect(
        await saveApplicationReview(tx, actor, {
          ...baseline,
          expectedRevision: reviewRevisionSchema.parse(1),
          change: {
            action: "record",
            id: assessmentId,
            contactId: sam.id,
            requestId,
            previousId: null,
            content,
          },
        }),
      ).toEqual({ status: "ok", revision: 2 });

      await tx.execute(sql.raw("RESET ROLE"));
      const reviews = (await readReviewsByCasesMap(tx, [address.publicId])).get(address.publicId);

      expect(reviews).toMatchObject({
        revision: 2,
        requests: [{ id: requestId, status: "received" }],
        assessments: [
          { id: assessmentId, versions: [{ content, recorder: { userId: actor.userId } }] },
        ],
      });
      const stored = await tx.execute(
        sql`select material_version, revision from application_cases where id = ${address.publicId}`,
      );
      expect(stored.rows).toEqual([{ material_version: 1, revision: 0 }]);

      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

const assistant: Actor = {
  userId: "dana",
  provenance: { interface: "mcp", clientId: "grant-assistant" },
};

it("records each saved assessment version on the assessment, not review requests", async ({
  db,
  database,
  reviewCase: { review },
}) => {
  const sam = await contact(db);

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
    content,
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

  const edited = { ...content, reasoning: "Reconsidered after the site visit." };
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
  reviewCase: { review },
}) => {
  const sam = await contact(db);

  const input = (id = randomUUID()): Extract<ReviewChange, { action: "record" }> => ({
    action: "record",
    id,
    contactId: sam.id,
    requestId: null,
    previousId: null,
    content,
  });

  expect(await review(input(), { expectedRevision: reviewRevisionSchema.parse(5) })).toEqual({
    status: "conflict",
  });
  expect(
    await review({
      ...input(),
      content: { ...content, applicationVersion: materialVersionSchema.parse(9) },
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

it("protects each recorded assessment version and its observations", async ({
  db,
  database,
  reviewCase: { review, read, address },
}) => {
  const sam = await contact(db);
  const id = randomUUID();
  expect(
    await review({
      action: "record",
      id,
      contactId: sam.id,
      requestId: null,
      previousId: null,
      content: {
        ...content,
        observations: [
          { criterionId: null, criterion: "Community fit", text: "Matches round goals." },
        ],
      },
    }),
  ).toMatchObject({ status: "ok" });
  // Version 2 has no observation whose own deletion guard could reject the cascade.
  expect(await review({ action: "edit", id, note: "Remove observation", content })).toMatchObject({
    status: "ok",
  });
  const before = await read();
  expect(
    (await database.client.query("SELECT 1 FROM application_cases WHERE id=$1", [address.publicId]))
      .rowCount,
  ).toBe(1);
  for (const query of [
    "UPDATE assessment_versions SET reasoning=reasoning",
    "UPDATE assessment_version_observations SET text=text",
    "DELETE FROM assessment_versions WHERE version = 2",
    "DELETE FROM assessment_version_observations",
  ]) {
    await expect(database.client.query(query)).rejects.toMatchObject({ code: "23514" });
  }
  await expect(
    database.client.query(
      "INSERT INTO assessment_version_observations (case_id, assessment_id, version, position, criterion_id, criterion, text) VALUES ($1, $2, 1, 1, NULL, 'Extra', 'Added')",
      [address.publicId, id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  expect(await read()).toEqual(before);
});
