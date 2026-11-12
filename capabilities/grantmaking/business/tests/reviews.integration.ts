import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import {
  createFundingApplication,
  editFundingApplication,
  selectApplicationContact,
} from "@merit/applications/server";
import { recordAuditEvent } from "@merit/audit/server/record";
import { listWorkspaceContacts, changeWorkspaceContact } from "@merit/contacts/server";
import {
  getFundingApplicationPage,
  getFundingApplicationContent,
  getFundingRoundPage,
} from "@merit/grantmaking/server";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import type { ReviewChange } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, editFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

const contact = async (db: NodePgDatabase, name = "Sam") => {
  const input = {
    workspaceSlug,
    contactId: randomUUID(),
    action: "create" as const,
    details: { name, email: "", affiliation: "" },
  };
  const result = await changeWorkspaceContact(db, actor, input, fundingRoundContactUsage);

  if (result.status !== "ok") {
    throw new Error("Contact creation failed");
  }
  return result.contact;
};

const setup = async (db: NodePgDatabase) => {
  const round = await createFundingRound(
    db,
    actor,
    {
      workspaceSlug,
      requestId: randomUUID(),
      title: "Review round",
    },
    recordAuditEvent,
  );

  if (round.status !== "ok") {
    throw new Error("Round creation failed");
  }

  const application = await createFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: round.publicId,
      requestId: randomUUID(),
      title: "Workshop Saturdays",
      applicant: "Repair Collective",
      requested: "18000",
      answers: [
        {
          questionId: "9841b190-2a06-5fe1-a7af-5e5b534662c5",
          question: "Plan",
          response: "Repair workshops with a free venue.",
        },
      ],
    },
    recordAuditEvent,
  );

  if (application.status !== "ok") {
    throw new Error("Application creation failed");
  }

  const address = { workspaceSlug, publicId: application.publicId };

  const read = async () => (await getFundingApplicationPage(db, actor, address))!;

  const review = async (change: ReviewChange) => {
    const page = await read();

    return saveApplicationReview(
      db,
      actor,
      {
        ...address,
        expectedRevision: page.application.reviews.revision,
        expectedApplicationVersion: page.application.version,
        expectedCriteriaVersion: page.round.criteriaVersion,
        change,
      },
      recordAuditEvent,
    );
  };

  return { round, address, read, review };
};

const content = {
  applicationVersion: materialVersionSchema.parse(1),
  criteriaVersion: criteriaVersionSchema.parse(1),
  date: null,
  position: "Fund" as const,
  amount: "18000",
  reasoning: "Practical plan with a confirmed free venue.",
  observations: [],
};

it("writes only a new correction version and leaves unrelated reviews untouched", async ({
  db,
  database,
}) => {
  const { read, review } = await setup(db);
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
    expect(after.application.reviews.requests).toEqual(before.application.reviews.requests);
    expect(after.application.reviews.assessments[0]?.versions).toEqual([
      ...before.application.reviews.assessments[0]!.versions,
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
}) => {
  const { read, review } = await setup(db);
  const sam = await contact(db);
  const requestId = randomUUID();
  expect(
    await review({ action: "request", id: requestId, contactId: sam.id, replacesId: null }),
  ).toEqual({ status: "ok", revision: 1 });
  const before = await read();
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
    ).rejects.toThrow();
    expect(await read()).toEqual(before);
  } finally {
    await database.client.query(
      "DROP TRIGGER reject_assessment_version ON assessment_versions; DROP FUNCTION reject_assessment_version()",
    );
  }
});

it.for(["request", "record"] as const)(
  "retries a completed review %s with its original baseline without changing history",
  async (action, { db }) => {
    const { address, read } = await setup(db);
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
    const first = await saveApplicationReview(db, actor, request, recordAuditEvent);
    expect(first).toEqual({ status: "ok", revision: 1 });
    const before = await read();

    expect(await saveApplicationReview(db, actor, request, recordAuditEvent)).toEqual(first);
    expect(await read()).toEqual(before);
  },
);

it("recreates the changed-budget scenario, keeps history, and distinguishes follow-up work", async ({
  db,
}) => {
  const { round, address, read, review } = await setup(db);
  const sam = await contact(db);
  const jules = await contact(db, "Jules");
  const samRequest = randomUUID();
  const julesRequest = randomUUID();

  expect(
    await review({ action: "request", id: samRequest, contactId: sam.id, replacesId: null }),
  ).toMatchObject({ status: "ok" });
  expect(
    await review({ action: "request", id: julesRequest, contactId: jules.id, replacesId: null }),
  ).toMatchObject({ status: "ok" });

  const assessment = randomUUID();

  expect(
    await review({
      action: "record",
      id: assessment,
      contactId: sam.id,
      requestId: samRequest,
      previousId: null,
      content,
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change: { action: "mark_ready" },
      },
      applicationWork,
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });
  expect(
    await saveFundingRecommendation(
      db,
      actor,
      {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        recommendation: {
          position: "Fund",
          allocation: encodeMoney(fromMinorUnits(1800000n)),
          reasoning: "Support the original plan.",
        },
      },
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });

  const edit = async (change: Parameters<typeof editFundingApplication>[2]["change"]) =>
    editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change,
      },
      applicationWork,
      recordAuditEvent,
    );

  await edit({ action: "start_revision", kind: "revision" });
  await edit({
    action: "save_revision",
    draft: {
      kind: "revision",
      reason: "Free venue lost",
      content: {
        title: "Workshop Saturdays",
        applicant: "Repair Collective",
        requested: "22000",
        answers: [
          {
            questionId: "9841b190-2a06-5fe1-a7af-5e5b534662c5",
            question: "Plan",
            response: "Replacement venue costs 4000.",
          },
        ],
      },
    },
  });

  expect(await edit({ action: "publish_revision" })).toMatchObject({ status: "ok" });

  let page = await read();

  expect(page.application.assessments.map((value) => value.status)).toEqual([
    "outdated",
    "outstanding",
  ]);
  expect(encodeMoney(page.application.managerRecommendation!.allocation).minorUnits).toBe(
    "1800000",
  );
  expect(
    await review({
      action: "edit",
      id: assessment,
      content: { ...content, reasoning: "Corrected transcription." },
      note: "",
    }),
  ).toMatchObject({ status: "ok" });

  page = await read();

  expect(
    (
      page.application.reviews!.assessments[0] ??
      assert.fail("Expected page.application.reviews!.assessments[0]")
    ).versions,
  ).toHaveLength(2);

  const roundPage = (await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    kind: "round",
  }))!;

  expect(
    await editFundingRound(
      db,
      actor,
      {
        workspaceSlug,
        publicId: round.publicId,
        expectedRevision: roundPage.preparation.revision,
        change: {
          section: "criteria",
          criteria: [
            {
              id: "64b39d9c-7b1e-5614-a6fa-bee3d45492d6",
              title: "Venue",
              description: "Check the replacement venue.",
            },
          ],
        },
      },
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });

  page = await read();

  expect(
    (page.application.assessments[0] ?? assert.fail("Expected page.application.assessments[0]"))
      .criteriaChanged,
  ).toBe(true);
  expect(page.application.reviews!.requests).toHaveLength(2);

  const followup = randomUUID();
  await review({ action: "request", id: followup, contactId: sam.id, replacesId: null });
  await review({
    action: "record",
    id: randomUUID(),
    contactId: sam.id,
    requestId: followup,
    previousId: assessment,
    content: {
      ...content,
      applicationVersion: materialVersionSchema.parse(2),
      criteriaVersion: criteriaVersionSchema.parse(2),
      position: null,
      amount: null,
      reasoning: "Need the venue confirmation.",
    },
  });
  page = await read();

  expect(page.application.assessments.map((value) => value.status)).toEqual([
    "current",
    "outstanding",
  ]);
  expect(page.application.reviews!.assessments).toHaveLength(2);
});

it("resolves live contact details without rewriting applications or history, and blocks archival with outstanding requests", async ({
  db,
  database,
}) => {
  const { address, read, review } = await setup(db);
  const sam = await contact(db);

  expect(
    await selectApplicationContact(db, actor, {
      ...address,
      expectedRevision: 0,
      contactId: sam.id,
    }),
  ).toEqual({ status: "ok", revision: 1 });

  const requestId = randomUUID();
  await review({ action: "request", id: requestId, contactId: sam.id, replacesId: null });
  const previousPage = await read();
  const storedBefore = (
    await database.client.query(
      "SELECT m.content AS snapshot, c.revision FROM application_cases c JOIN material_versions m ON m.case_id=c.id AND m.version=c.material_version WHERE c.id = $1",
      [address.publicId],
    )
  ).rows;
  expect(storedBefore[0]).not.toHaveProperty("snapshot.submission.contact");
  expect(storedBefore[0]).not.toHaveProperty("snapshot.submission.contactEmail");

  const change = {
    workspaceSlug,
    contactId: sam.id,
    action: "update" as const,
    expectedContactRevision: 0,
    details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
  };

  expect(await changeWorkspaceContact(db, actor, change, fundingRoundContactUsage)).toMatchObject({
    status: "ok",
  });

  let page = await read();

  expect(page.application.submission?.contact).toBe("Sam Morgan");
  expect(page.intake.revision).toBe(previousPage.intake.revision);
  expect(page.intake.history).toEqual(previousPage.intake.history);
  expect(
    (
      await database.client.query(
        "SELECT m.content AS snapshot, c.revision FROM application_cases c JOIN material_versions m ON m.case_id=c.id AND m.version=c.material_version WHERE c.id = $1",
        [address.publicId],
      )
    ).rows,
  ).toEqual(storedBefore);
  const mcpSubmission = await getFundingApplicationContent(db, actor, {
    workspaceSlug,
    applicationId: address.publicId,
    section: "submission",
  });
  assert(mcpSubmission.status === "ok");
  expect(JSON.parse(mcpSubmission.content)).toMatchObject({
    contact: "Sam Morgan",
    contactEmail: "sam@example.test",
  });
  const round = await getFundingRoundPage(db, actor, {
    workspaceSlug,
    publicId: page.round.id,
    kind: "round",
  });
  expect(round?.round.applications[0]?.submission?.contact).toBe("Sam Morgan");
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: previousPage.intake.revision,
        change: { action: "details", summary: "Saved after the contact changed" },
      },
      applicationWork,
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });

  expect(
    (
      page.application.reviews.requests[0] ??
      assert.fail("Expected page.application.reviews.requests[0]")
    ).reviewer,
  ).toBe("Sam");

  const directory = await listWorkspaceContacts(
    db,
    actor,
    { workspaceSlug },
    fundingRoundContactUsage,
  );

  if (directory.status !== "ok") {
    throw new Error("Missing contact directory");
  }
  expect(directory.contacts.find((value) => value.id === sam.id)?.applicationTitles).toEqual([
    "Workshop Saturdays",
  ]);
  expect(page.application.version).toBe(1);
  expect(
    (page.intake.history[0] ?? assert.fail("Expected page.intake.history[0]")).after?.submission
      ?.contact,
  ).toBe("Sam");
  expect(
    await changeWorkspaceContact(
      db,
      actor,
      { workspaceSlug, contactId: sam.id, action: "archive", expectedContactRevision: 1 },
      fundingRoundContactUsage,
    ),
  ).toMatchObject({ status: "invalid", error: "outstanding_requests" });

  await review({ action: "cancel", id: requestId });

  expect(
    await changeWorkspaceContact(
      db,
      actor,
      { workspaceSlug, contactId: sam.id, action: "archive", expectedContactRevision: 1 },
      fundingRoundContactUsage,
    ),
  ).toMatchObject({ status: "ok" });

  page = await read();

  expect(page.application.contactId).toBe(sam.id);
  expect(
    await review({ action: "request", id: randomUUID(), contactId: sam.id, replacesId: null }),
  ).toMatchObject({ status: "invalid", error: "contact_unavailable" });
});

it("rejects other-workspace access, stale edits, and guessed review bases", async ({
  db,
  database,
}) => {
  const { address, read, review } = await setup(db);
  const sam = await contact(db);
  const other = { userId: "birch-manager" };

  expect(
    await listWorkspaceContacts(db, other, { workspaceSlug }, fundingRoundContactUsage),
  ).toEqual({
    status: "not_found",
  });

  const change = {
    action: "record" as const,
    id: randomUUID(),
    contactId: sam.id,
    requestId: null,
    previousId: null,
    content: {
      ...content,
      applicationVersion: null,
      criteriaVersion: null,
      position: null,
      amount: null,
    },
  };
  const input = {
    ...address,
    expectedRevision: reviewRevisionSchema.parse(0),
    expectedApplicationVersion: materialVersionSchema.parse(1),
    expectedCriteriaVersion: criteriaVersionSchema.parse(1),
    change,
  };

  expect(await saveApplicationReview(db, other, input, recordAuditEvent)).toEqual({
    status: "not_found",
  });
  expect(await saveApplicationReview(db, actor, input, recordAuditEvent)).toMatchObject({
    status: "ok",
  });
  expect(await saveApplicationReview(db, actor, input, recordAuditEvent)).toMatchObject({
    status: "ok",
  });
  expect(
    (
      (await read()).application.assessments[0] ??
      assert.fail("Expected (await read()).application.assessments[0]")
    ).status,
  ).toBe("unknown");
  expect(
    await saveApplicationReview(
      db,
      actor,
      {
        ...input,
        change: { action: "edit", id: change.id, content, note: "" },
      },
      recordAuditEvent,
    ),
  ).toEqual({ status: "conflict" });
  expect(
    await review({
      action: "edit",
      id: change.id,
      content: { ...content, applicationVersion: materialVersionSchema.parse(99) },
      note: "",
    }),
  ).toMatchObject({ status: "invalid", error: "version_unavailable" });

  await database.client.query(
    "UPDATE memberships SET role = 'member' WHERE user_id = 'dana' AND organization_id = 'alder'",
  );

  expect(await saveApplicationReview(db, actor, input, recordAuditEvent)).toEqual({
    status: "not_found",
  });
});

it("rejects cross-workspace contact links and preserves the authorized profile", async ({
  db,
  database,
}) => {
  const { address, read } = await setup(db);
  const sam = await contact(db);
  await selectApplicationContact(db, actor, { ...address, expectedRevision: 0, contactId: sam.id });
  const before = await read();
  await expect(
    database.client.query("UPDATE contacts SET organization_id = 'birch' WHERE id = $1", [sam.id]),
  ).rejects.toMatchObject({ code: "23503" });
  expect(await read()).toEqual(before);
  const result = await getFundingApplicationContent(db, actor, {
    workspaceSlug,
    applicationId: address.publicId,
    section: "submission",
  });
  assert(result.status === "ok");
  expect(JSON.parse(result.content)).toMatchObject({ contact: sam.name });
});

it("records reviews using version references without reading application content or recommendations", async ({
  db,
}) => {
  const { address } = await setup(db);
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
          `GRANT SELECT ON app_users, memberships, organizations, application_cases, criteria_versions, review_states, review_requests, review_assignments, assessments, assessment_versions, contacts TO ${role}`,
        ),
      );
      await tx.execute(
        sql.raw(
          `GRANT SELECT (id, organization_id, criteria_version) ON funding_rounds TO ${role}`,
        ),
      );
      await tx.execute(sql.raw(`GRANT SELECT (case_id, version) ON material_versions TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (id) ON funding_rounds, app_users TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (id) ON application_cases TO ${role}`));
      await tx.execute(sql.raw(`GRANT INSERT ON assessments, assessment_versions TO ${role}`));
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
        await saveApplicationReview(
          tx,
          actor,
          {
            ...baseline,
            change: { action: "request", id: requestId, contactId: sam.id, replacesId: null },
          },
          recordAuditEvent,
        ),
      ).toEqual({ status: "ok", revision: 1 });
      expect(
        await saveApplicationReview(
          tx,
          actor,
          {
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
          },
          recordAuditEvent,
        ),
      ).toEqual({ status: "ok", revision: 2 });

      await tx.execute(sql.raw("RESET ROLE"));
      const page = await getFundingApplicationPage(tx, actor, address);

      expect(page?.application.reviews).toMatchObject({
        revision: 2,
        requests: [{ id: requestId, status: "received" }],
        assessments: [
          { id: assessmentId, versions: [{ content, recorder: { userId: actor.userId } }] },
        ],
      });
      expect(page?.application.version).toBe(1);
      expect(page?.intake.revision).toBe(0);

      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it("supports contacts and reviews with the documented runtime grants and immutable history", async ({
  db,
}) => {
  const { address } = await setup(db);
  const role = `review_runtime_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("Remove the temporary role and grants");

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
          `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, application_cases, material_versions, material_drafts, criteria_versions, review_states, review_requests, review_assignments, assessments, assessment_versions, recommendation_versions TO ${role}`,
        ),
      );
      await tx.execute(sql.raw(`GRANT UPDATE (name) ON organizations TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (id) ON funding_rounds, app_users TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE (user_id) ON memberships TO ${role}`));
      await tx.execute(sql.raw(`GRANT UPDATE ON application_cases TO ${role}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT ON case_changes TO ${role}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT ON audit_events TO ${role}`));
      await tx.execute(
        sql.raw(`GRANT INSERT ON material_versions, assessments, assessment_versions TO ${role}`),
      );
      await tx.execute(
        sql.raw(`GRANT INSERT, UPDATE ON review_states, review_requests TO ${role}`),
      );
      await tx.execute(sql.raw(`GRANT INSERT, UPDATE, DELETE ON material_drafts TO ${role}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE ON contacts TO ${role}`));
      await tx.execute(sql.raw(`GRANT SELECT, INSERT ON contact_changes TO ${role}`));
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      const input = {
        workspaceSlug,
        contactId: randomUUID(),
        action: "create" as const,
        details: { name: "Runtime reviewer", email: "reviewer@example.test", affiliation: "" },
      };

      expect(
        await changeWorkspaceContact(tx, actor, input, fundingRoundContactUsage),
      ).toMatchObject({
        status: "ok",
      });
      expect(
        await selectApplicationContact(tx, actor, {
          ...address,
          expectedRevision: 0,
          contactId: input.contactId,
        }),
      ).toMatchObject({ status: "ok" });
      expect(
        await changeWorkspaceContact(
          tx,
          actor,
          {
            ...input,
            action: "update",
            expectedContactRevision: 0,
            details: { ...input.details, name: "Updated reviewer" },
          },
          fundingRoundContactUsage,
        ),
      ).toMatchObject({ status: "ok", contact: { revision: 1 } });

      const contacts = await listWorkspaceContacts(
        tx,
        actor,
        { workspaceSlug },
        fundingRoundContactUsage,
      );

      expect(contacts.status).toBe("ok");

      assert(contacts.status === "ok");

      expect(contacts.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: input.contactId, name: "Updated reviewer" }),
        ]),
      );

      const page = (await getFundingApplicationPage(tx, actor, address))!;

      expect(page.application.submission?.contact).toBe("Updated reviewer");
      expect(page.application.reviews).toEqual({ revision: 0, requests: [], assessments: [] });
      expect(page.round).toMatchObject({
        criteriaVersion: criteriaVersionSchema.parse(1),
        criteriaHistory: [{ version: 1, criteria: [] }],
      });

      const requestId = randomUUID();
      const baseline = {
        ...address,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      };

      expect(
        await saveApplicationReview(
          tx,
          actor,
          {
            ...baseline,
            change: {
              action: "request",
              id: requestId,
              contactId: input.contactId,
              replacesId: null,
            },
          },
          recordAuditEvent,
        ),
      ).toMatchObject({ status: "ok" });
      expect(
        await saveApplicationReview(
          tx,
          actor,
          {
            ...baseline,
            expectedRevision: reviewRevisionSchema.parse(1),
            change: {
              action: "record",
              id: randomUUID(),
              contactId: input.contactId,
              requestId,
              previousId: null,
              content,
            },
          },
          recordAuditEvent,
        ),
      ).toMatchObject({ status: "ok" });
      expect(
        (await getFundingApplicationPage(tx, actor, address))!.application.assessments,
      ).toMatchObject([{ reviewer: "Updated reviewer", status: "current" }]);
      expect(
        (
          await tx.execute(
            sql`SELECT has_table_privilege(current_user, 'contact_changes', 'UPDATE') AS update, has_table_privilege(current_user, 'contact_changes', 'DELETE') AS delete`,
          )
        ).rows,
      ).toEqual([{ update: false, delete: false }]);

      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
