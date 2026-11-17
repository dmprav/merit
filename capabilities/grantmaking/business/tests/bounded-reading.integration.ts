import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import { changeWorkspaceContact } from "@merit/contacts/server";
import {
  listContactApplications,
  listApplicationReviewSummaries,
  getFundingRoundPage,
  getFundingApplicationPage,
  getFundingRoundOverview,
  listFundingRoundSummaries,
  listFundingApplications,
  getFundingApplicationContext,
  getFundingApplicationContent,
  listFundingApplicationHistory,
  getFundingRoundContent,
  listFundingRoundHistory,
  listFundingRounds,
  listWorkspaceApplications,
  listWorkspaceActivity,
  applicationAuditHistory,
  roundBudgetHistory,
} from "@merit/grantmaking/server";
import { removeDemoFunding } from "@merit/grantmaking/server/demo";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import type { ReviewChange } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";

it("paginates independently of exact whole-round totals and enforces current access", async ({
  db,
}) => {
  const created = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Bounded reads",
    budget: "90071992547409.93",
  });
  assert(created.status === "ok");
  const address = { workspaceSlug, roundId: created.publicId };
  const ids = [];
  for (const requested of ["100.01", "", "200.02"]) {
    const result = await createFundingApplication(db, actor, {
      workspaceSlug,
      publicId: address.roundId,
      requestId: randomUUID(),
      title: `Application ${requested}`,
      requested,
    });
    assert(result.status === "ok");
    ids.push(result.publicId);
  }
  const first = await listFundingApplications(db, actor, { ...address, limit: 1 });
  assert(first.status === "ok" && first.nextCursor);
  expect(first.applications).toHaveLength(1);
  const second = await listFundingApplications(db, actor, {
    ...address,
    limit: 1,
    after: first.nextCursor,
  });
  assert(second.status === "ok" && second.nextCursor);
  const third = await listFundingApplications(db, actor, {
    ...address,
    limit: 1,
    after: second.nextCursor,
  });
  assert(third.status === "ok");
  expect(third.nextCursor).toBeNull();
  expect(
    [...first.applications, ...second.applications, ...third.applications]
      .map((item) => item.applicationId)
      .sort(),
  ).toEqual(ids.sort());
  const overview = await getFundingRoundOverview(db, actor, address);
  expect(overview).toMatchObject({
    status: "ok",
    round: {
      applicationCount: 3,
      totals: {
        requested: { minorUnits: "30003", currency: "EUR" },
        unknownRequests: 1,
        proposed: { minorUnits: "0", currency: "EUR" },
        remaining: { minorUnits: "9007199254740993", currency: "EUR" },
      },
    },
  });
  expect(await getFundingRoundOverview(db, { userId: "birch-manager" }, address)).toEqual({
    status: "not_found",
  });
  await db.execute(sql`delete from memberships where user_id = ${actor.userId}`);
  expect(await listFundingApplications(db, actor, address)).toEqual({ status: "not_found" });
  expect(await listFundingRoundSummaries(db, actor, { workspaceSlug })).toEqual({
    status: "not_found",
  });
});

it("bounds Unicode content at the database boundary, preserves all evidence and rejects mixed revisions", async ({
  db,
}) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Evidence",
  });
  assert(round.status === "ok");
  const response = "Evidence 🪴 ".repeat(1800).trim();
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Long source",
    applicant: "Applicant",
    requested: "1",
    answers: [{ questionId: "e34860fd-d4e1-52b9-8f1c-90089da14a56", question: "Why", response }],
  });
  assert(created.status === "ok");
  const address = { workspaceSlug, applicationId: created.publicId };
  const context = await getFundingApplicationContext(db, actor, address);
  expect(context).toMatchObject({
    status: "ok",
    application: {
      intakeRevision: 0,
      reviewRevision: 0,
      recommendationRevision: 0,
      applicationVersion: 1,
    },
  });
  expect(JSON.stringify(context).length).toBeLessThan(1000);
  const first = await getFundingApplicationContent(db, actor, {
    ...address,
    section: "submission",
  });
  assert(first.status === "ok" && first.nextOffset);
  expect(Array.from(first.content)).toHaveLength(8000);
  let text = first.content;
  let offset: number | null = first.nextOffset;
  while (offset !== null) {
    const chunk = await getFundingApplicationContent(db, actor, {
      ...address,
      section: "submission",
      offset,
      fingerprint: first.fingerprint,
    });
    assert(chunk.status === "ok");
    text += chunk.content;
    offset = chunk.nextOffset;
  }
  expect(JSON.parse(text)).toMatchObject({
    answers: [{ questionId: "e34860fd-d4e1-52b9-8f1c-90089da14a56", question: "Why", response }],
  });
  expect(
    await getFundingApplicationContent(db, actor, {
      ...address,
      section: "submission",
      offset: 8000,
    }),
  ).toEqual({ status: "conflict" });
  expect(
    await getFundingApplicationContent(
      db,
      { userId: "birch-manager" },
      { ...address, section: "submission" },
    ),
  ).toEqual({ status: "not_found" });
  const edited = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: created.publicId,
      expectedRevision: 0,
      change: {
        action: "save_content",
        content: {
          title: "Long source",
          applicant: "Applicant",
          requested: "1",
          answers: [
            {
              questionId: "e34860fd-d4e1-52b9-8f1c-90089da14a56",
              question: "Why",
              response: "Corrected",
            },
          ],
        },
      },
    },
    applicationWork,
  );
  assert(edited.status === "ok");
  expect(
    await getFundingApplicationContent(db, actor, {
      ...address,
      section: "submission",
      offset: 8000,
      fingerprint: first.fingerprint,
    }),
  ).toEqual({ status: "conflict" });
});

it("keeps historical evidence addressable after eligible records are deleted", async ({ db }) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Temporary",
  });
  assert(round.status === "ok");
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Unused",
  });
  assert(created.status === "ok");
  expect(
    (
      await editFundingApplication(
        db,
        actor,
        {
          workspaceSlug,
          publicId: created.publicId,
          expectedRevision: 0,
          change: { action: "delete" },
        },
        applicationWork,
      )
    ).status,
  ).toBe("ok");
  const history = await listFundingApplicationHistory(db, actor, {
    workspaceSlug,
    applicationId: created.publicId,
    history: "intake",
    limit: 1,
  });
  assert(history.status === "ok" && history.nextRevision !== null);
  expect(history.entries[0]?.revision).toBe(0);
  const content = await getFundingApplicationContent(db, actor, {
    workspaceSlug,
    applicationId: created.publicId,
    section: "intake_change",
    revision: 0,
  });
  assert(content.status === "ok");
  expect(JSON.parse(content.content)).toMatchObject({
    action: "application.created",
    actorName: "Dana Reed",
    formatVersion: 1,
    after: { application: { title: "Unused" } },
  });
  expect(
    (
      await deleteFundingRound(
        db,
        actor,
        {
          workspaceSlug,
          publicId: round.publicId,
          expectedRevision: 0,
        },
        roundHasApplications,
      )
    ).status,
  ).toBe("ok");
  expect(
    (await listFundingRoundHistory(db, actor, { workspaceSlug, roundId: round.publicId })).status,
  ).toBe("ok");
  expect(
    (
      await getFundingRoundContent(db, actor, {
        workspaceSlug,
        roundId: round.publicId,
        section: "preparation_change",
        revision: 0,
      })
    ).status,
  ).toBe("ok");
});

it("returns the same review freshness as shared web reads without loading histories into summary results", async ({
  db,
}) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Review summaries",
  });
  assert(round.status === "ok");
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Reviewed application",
  });
  assert(created.status === "ok");

  const reviewer = async (name: string) => {
    const result = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        contactId: randomUUID(),
        action: "create",
        details: { name, email: "", affiliation: "" },
      },
      fundingRoundContactUsage,
    );
    assert(result.status === "ok");
    return result.contact.id;
  };

  const content = {
    applicationVersion: materialVersionSchema.parse(1),
    criteriaVersion: criteriaVersionSchema.parse(1),
    date: null,
    position: "Fund" as const,
    amount: null,
    reasoning: "Practical plan.",
    observations: [],
  };
  const ids = { current: randomUUID(), unknown: randomUUID(), outstanding: randomUUID() };
  const changes: ReviewChange[] = [
    {
      action: "record",
      id: ids.current,
      contactId: await reviewer("Sam"),
      requestId: null,
      previousId: null,
      content,
    },
    {
      action: "record",
      id: ids.unknown,
      contactId: await reviewer("Jules"),
      requestId: null,
      previousId: null,
      content: { ...content, applicationVersion: null, criteriaVersion: null },
    },
    {
      action: "request",
      id: ids.outstanding,
      contactId: await reviewer("Lee"),
      replacesId: null,
    },
  ];
  for (const [revision, change] of changes.entries()) {
    expect(
      await saveApplicationReview(db, actor, {
        workspaceSlug,
        publicId: created.publicId,
        expectedRevision: reviewRevisionSchema.parse(revision),
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
        change,
      }),
    ).toMatchObject({ status: "ok" });
  }

  const input = { workspaceSlug, applicationId: created.publicId };
  const summaries = [];
  let after: string | undefined;
  do {
    const listed = await listApplicationReviewSummaries(db, actor, { ...input, limit: 1, after });
    assert(listed.status === "ok");
    expect(listed.reviews.length).toBeLessThanOrEqual(1);
    summaries.push(...listed.reviews);
    after = listed.nextCursor ?? undefined;
  } while (after);

  const byId = (items: { id: string; freshness: string }[]) =>
    items.map(({ id, freshness }) => ({ id, freshness })).sort((a, b) => a.id.localeCompare(b.id));

  const expected = byId(Object.entries(ids).map(([freshness, id]) => ({ id, freshness })));
  expect(byId(summaries)).toEqual(expected);
  const page = await getFundingApplicationPage(db, actor, {
    workspaceSlug,
    publicId: created.publicId,
  });
  assert(page);
  expect(
    byId(page.application.assessments.map((item) => ({ id: item.id, freshness: item.status }))),
  ).toEqual(expected);
  for (const summary of summaries) {
    expect(summary).not.toHaveProperty("reasoning");
    expect(summary).not.toHaveProperty("versions");
    const usage = await listContactApplications(db, actor, {
      workspaceSlug,
      contactId: summary.contactId,
    });
    assert(usage.status === "ok");
    expect(usage.applications.map((item) => item.applicationId)).toEqual([created.publicId]);
    expect(usage.applications[0]).toMatchObject({
      roundTitle: "Review summaries",
      relationships: [summary.kind === "assessment" ? "assessment_recorded" : "review_requested"],
    });
  }
  const assessment = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "assessment",
    entryId: ids.current,
  });
  assert(assessment.status === "ok");
  expect(JSON.parse(assessment.content)).toMatchObject({
    id: ids.current,
    reviewer: "Sam",
    versions: [{ content: { reasoning: "Practical plan." } }],
  });
});

it("returns typed error statuses on malformed query inputs and distinguishes forbidden from not_found", async ({
  db,
  database,
}) => {
  await seedExampleRounds(db);

  expect(await listFundingRoundSummaries(db, actor, { workspaceSlug: "BAD SLUG" })).toEqual({
    status: "not_found",
  });
  expect(
    await getFundingRoundOverview(db, actor, { workspaceSlug, roundId: "invalid-id" }),
  ).toEqual({ status: "not_found" });
  expect(
    await getFundingApplicationContext(db, actor, { workspaceSlug, applicationId: "invalid-id" }),
  ).toEqual({ status: "not_found" });
  expect(
    await getFundingRoundContent(db, actor, {
      workspaceSlug,
      roundId: "000000000001",
      section: "details",
      offset: -1,
    }),
  ).toEqual({ status: "invalid_range" });
  expect(
    await getFundingApplicationContent(db, actor, {
      workspaceSlug,
      applicationId: "000000000001",
      section: "details",
      offset: -1,
    }),
  ).toEqual({ status: "invalid_range" });
  expect(await listFundingRounds(db, actor, "BAD SLUG")).toEqual({ status: "not_found" });
  expect(await listWorkspaceApplications(db, actor, { workspaceSlug: "BAD SLUG" })).toEqual({
    status: "not_found",
  });
  await expect(
    listWorkspaceActivity(db, actor, { workspaceSlug: "BAD SLUG" }),
  ).rejects.toMatchObject({ name: "ZodError" });
  expect(
    await getFundingRoundPage(db, actor, {
      workspaceSlug,
      publicId: "invalid-id",
      kind: "round",
    }),
  ).toBeNull();
  expect(
    await getFundingApplicationPage(db, actor, {
      workspaceSlug,
      publicId: "invalid-id",
    }),
  ).toBeNull();
  expect(
    await applicationAuditHistory(db, actor, { workspaceSlug, applicationId: "invalid-id" }),
  ).toEqual({ status: "not_found" });
  expect(await roundBudgetHistory(db, actor, { workspaceSlug, roundId: "invalid-id" })).toEqual({
    status: "not_found",
  });

  await database.client.query(
    "UPDATE memberships SET role = 'member' WHERE organization_id = 'alder' AND user_id = 'dana'",
  );
  expect(await listFundingRoundSummaries(db, actor, { workspaceSlug })).toEqual({
    status: "forbidden",
  });
  expect(await listWorkspaceApplications(db, actor, { workspaceSlug: workspaceSlug })).toEqual({
    status: "forbidden",
  });
});

it("removes demo funding rounds only from the given workspace", async ({ db, database }) => {
  await seedExampleRounds(db);

  await db.transaction((tx) => removeDemoFunding(tx, workspaceSlug));
  const { rows } = await database.client.query<{ organization_id: string; count: string }>(
    "SELECT organization_id, count(*)::text AS count FROM funding_rounds GROUP BY organization_id",
  );
  expect(rows).toEqual([{ organization_id: "birch", count: "1" }]);
});
