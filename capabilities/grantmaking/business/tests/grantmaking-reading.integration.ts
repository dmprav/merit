import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import {
  createFundingApplication,
  editFundingApplication,
  selectApplicationContact,
} from "@merit/applications/server";
import { recordAuditEvent } from "@merit/audit/server/record";
import {
  getFundingApplicationContent,
  getFundingApplicationContext,
  getFundingRoundOverview,
} from "@merit/grantmaking/server";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

it("keeps case identity and authorized material reads independent of round grouping", async ({
  db,
}) => {
  const round = await createFundingRound(
    db,
    actor,
    {
      workspaceSlug,
      requestId: randomUUID(),
      title: "Intake group",
    },
    recordAuditEvent,
  );
  assert(round.status === "ok");
  const application = await createFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: round.publicId,
      requestId: randomUUID(),
      title: "Independent request",
      applicant: "Community group",
      requested: "25.01",
      answers: [
        {
          questionId: "87fccd1f-7f91-5e18-a784-9d11a01c0665",
          question: "Purpose",
          response: "Keep the request independently addressable.",
        },
      ],
    },
    recordAuditEvent,
  );
  assert(application.status === "ok");

  await db.execute(
    sql`update application_cases set round_id = null where id = ${application.publicId}`,
  );

  expect(
    await saveApplicationReview(
      db,
      actor,
      {
        workspaceSlug,
        publicId: application.publicId,
        expectedRevision: reviewRevisionSchema.parse(0),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
        change: { action: "request", id: randomUUID(), contactId: randomUUID(), replacesId: null },
      },
      recordAuditEvent,
    ),
  ).toEqual({ status: "invalid", error: "criteria_unavailable" });

  const input = { workspaceSlug, applicationId: application.publicId };
  expect(await getFundingApplicationContext(db, actor, input)).toMatchObject({
    status: "ok",
    application: {
      applicationId: application.publicId,
      roundId: null,
      title: "Independent request",
      criteriaVersion: null,
      roundPreparationRevision: null,
      requested: { minorUnits: "2501", currency: "EUR" },
    },
  });
  const material = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "submission",
  });
  assert(material.status === "ok");
  expect(JSON.parse(material.content)).toMatchObject({ organization: "Community group" });
  expect(await getFundingApplicationContext(db, { userId: "birch-manager" }, input)).toEqual({
    status: "not_found",
  });
  expect(
    await getFundingRoundOverview(db, actor, { workspaceSlug, roundId: round.publicId }),
  ).toMatchObject({
    status: "ok",
    round: { applicationCount: 0, totals: { requested: { minorUnits: "0", currency: "EUR" } } },
  });
});

it("reads immutable material versions without mixing in later staff interpretation", async ({
  db,
}) => {
  const round = await createFundingRound(
    db,
    actor,
    {
      workspaceSlug,
      requestId: randomUUID(),
      title: "Versioned material",
    },
    recordAuditEvent,
  );
  assert(round.status === "ok");
  const created = await createFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: round.publicId,
      requestId: randomUUID(),
      title: "Original request",
      applicant: "Applicant",
      requested: "10",
      answers: [
        {
          questionId: "87fccd1f-7f91-5e18-a784-9d11a01c0665",
          question: "Purpose",
          response: "Original evidence",
        },
      ],
    },
    recordAuditEvent,
  );
  assert(created.status === "ok");
  const input = { workspaceSlug, applicationId: created.publicId, section: "material" as const };
  const original = await getFundingApplicationContent(db, actor, { ...input, materialVersion: 1 });
  assert(original.status === "ok");
  expect(JSON.parse(original.content)).toMatchObject({
    version: 1,
    source: { kind: "recorded_external" },
    content: {
      title: "Original request",
      submission: { answers: [{ response: "Original evidence" }] },
    },
  });

  const changed = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: created.publicId,
      expectedRevision: 0,
      change: { action: "save_content", content: { title: "Updated request" } },
    },
    applicationWork,
    recordAuditEvent,
  );
  assert(changed.status === "ok");
  const annotated = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: created.publicId,
      expectedRevision: changed.revision,
      change: { action: "details", summary: "Staff interpretation" },
    },
    applicationWork,
    recordAuditEvent,
  );
  assert(annotated.status === "ok");
  expect(await getFundingApplicationContent(db, actor, { ...input, materialVersion: 1 })).toEqual(
    original,
  );
  const latest = await getFundingApplicationContent(db, actor, { ...input, materialVersion: 2 });
  assert(latest.status === "ok");
  const saved = JSON.parse(latest.content) as { content: unknown };
  expect(saved.content).toMatchObject({ title: "Updated request" });
  expect(saved.content).not.toHaveProperty("summary");
  expect(saved.content).not.toHaveProperty("summaryAuthor");
  expect(saved.content).not.toHaveProperty("reviews");
  expect(saved.content).not.toHaveProperty("managerRecommendation");
  expect(await getFundingApplicationContent(db, actor, { ...input, materialVersion: 3 })).toEqual({
    status: "not_found",
  });
  expect(await getFundingApplicationContent(db, actor, input)).toEqual({ status: "invalid_range" });
  expect(
    await getFundingApplicationContent(
      db,
      { userId: "birch-manager" },
      { ...input, materialVersion: 1 },
    ),
  ).toEqual({ status: "not_found" });
});

it("projects and clears the linked contact without putting profile data into recorded material", async ({
  db,
  database,
}) => {
  await seedExampleRounds(db);
  const { rows } = await database.client.query<{ id: string }>(
    "SELECT id FROM application_cases WHERE organization_id='alder' AND id=$1",
    [(await fundingExampleIds("alder")).applications.A1],
  );
  const application = rows[0];
  assert.isDefined(application);
  const input = { workspaceSlug, applicationId: application.id };
  const original = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "material",
    materialVersion: 1,
  });
  assert(original.status === "ok");
  expect(JSON.parse(original.content)).not.toHaveProperty("content.submission.contact");
  expect(JSON.parse(original.content)).not.toHaveProperty("content.submission.contactEmail");

  const linked = await getFundingApplicationContent(db, actor, { ...input, section: "submission" });
  assert(linked.status === "ok");
  expect(JSON.parse(linked.content)).toHaveProperty("contact", expect.any(String));

  const cleared = await selectApplicationContact(db, actor, {
    workspaceSlug,
    publicId: application.id,
    expectedRevision: 0,
    contactId: null,
  });
  assert(cleared.status === "ok");
  const current = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "submission",
  });
  assert(current.status === "ok");
  expect(JSON.parse(current.content)).not.toHaveProperty("contact");
  expect(JSON.parse(current.content)).not.toHaveProperty("contactEmail");
  expect(
    await getFundingApplicationContent(db, actor, {
      ...input,
      section: "material",
      materialVersion: 1,
    }),
  ).toEqual(original);
});

it("does not combine unrelated roundless requests into an artificial total", async ({ db }) => {
  const round = await createFundingRound(
    db,
    actor,
    {
      workspaceSlug,
      requestId: randomUUID(),
      title: "Intake",
    },
    recordAuditEvent,
  );
  assert(round.status === "ok");
  const ids: string[] = [];
  for (const title of ["First request", "Second request"]) {
    const result = await createFundingApplication(
      db,
      actor,
      {
        workspaceSlug,
        publicId: round.publicId,
        requestId: randomUUID(),
        title,
        requested: "9999999999999999999999999999.99",
      },
      recordAuditEvent,
    );
    assert(result.status === "ok");
    ids.push(result.publicId);
    await db.execute(
      sql`update application_cases set round_id = null where id = ${result.publicId}`,
    );
  }
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        workspaceSlug,
        publicId: ids[0]!,
        expectedRevision: 0,
        change: { action: "save_content", content: { title: "Revised first request" } },
      },
      applicationWork,
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });
});
