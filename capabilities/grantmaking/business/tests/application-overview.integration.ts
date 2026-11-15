import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication } from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { getFundingRoundPage, listWorkspaceApplications } from "@merit/grantmaking/server";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { fundingRoundContactUsage } from "@merit/grantmaking/server/integrations";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { actor } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

import { roundTest as it } from "./round-test";

it("lists applications across rounds with the same review facts as their round pages", async ({
  db,
  rounds,
}) => {
  await seedExampleRounds(db);
  const created = await rounds.createApplication("Another round's application");
  const example = await fundingExampleIds("alder");
  const result = await listWorkspaceApplications(db, actor, "alder");
  assert(result.status === "ok");

  expect(result.applications).toHaveLength(4);
  expect(result.applications.find((item) => item.id === created.publicId)).toMatchObject({
    title: "Another round's application",
    applicant: "Community group",
    roundId: rounds.pageInput.publicId,
    roundTitle: "Community grants",
    intakeStatus: "in_preparation",
    reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 0 },
    recommendation: null,
  });
  const page = await getFundingRoundPage(db, actor, {
    workspaceSlug: "alder",
    publicId: example.roundId,
    kind: "round",
  });
  assert.isNotNull(page);
  for (const application of page.round.applications) {
    const overview = result.applications.find((item) => item.id === application.id);
    expect(overview).toMatchObject({
      title: application.title,
      roundTitle: page.round.title,
      reviews: {
        current: application.assessments.filter((review) => review.status === "current").length,
        outdated: application.assessments.filter((review) => review.status === "outdated").length,
        outstanding: application.assessments.filter((review) => review.status === "outstanding")
          .length,
        unknown: application.assessments.filter((review) => review.status === "unknown").length,
      },
      recommendation: application.managerRecommendation
        ? {
            position: application.managerRecommendation.position,
            outdated:
              application.managerRecommendation.recorded?.applicationVersion !==
              application.version,
          }
        : null,
    });
    expect(overview).not.toHaveProperty("submission");
    expect(overview).not.toHaveProperty("reviewBases");
    expect(overview).not.toHaveProperty("criteria");
  }
});

it("uses the latest assessment version and counts a replacement only once", async ({
  db,
  rounds,
}) => {
  const address = await rounds.createApplication("Assessed application");
  const reviewer = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug: "alder",
      contactId: randomUUID(),
      action: "create",
      details: { name: "Sam Morgan", email: "", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(reviewer.status === "ok");
  const content = {
    applicationVersion: materialVersionSchema.parse(1),
    criteriaVersion: criteriaVersionSchema.parse(1),
    date: null,
    position: "Fund" as const,
    amount: "80.00",
    reasoning: "Clear plan for weekly activities.",
    observations: [],
  };
  const input = {
    ...address,
    expectedApplicationVersion: materialVersionSchema.parse(1),
    expectedCriteriaVersion: criteriaVersionSchema.parse(1),
  };

  const reviews = async () => {
    const result = await listWorkspaceApplications(db, actor, "alder");
    assert(result.status === "ok");
    return result.applications.find((item) => item.id === address.publicId);
  };

  const assessmentId = randomUUID();
  const recorded = await saveApplicationReview(db, actor, {
    ...input,
    expectedRevision: reviewRevisionSchema.parse(0),
    change: {
      action: "record",
      id: assessmentId,
      contactId: reviewer.contact.id,
      requestId: null,
      previousId: null,
      content,
    },
  });
  assert(recorded.status === "ok");
  const edited = await saveApplicationReview(db, actor, {
    ...input,
    expectedRevision: recorded.revision,
    change: {
      action: "edit",
      id: assessmentId,
      content: { ...content, applicationVersion: null, criteriaVersion: null },
      note: "Basis not supplied",
    },
  });
  assert(edited.status === "ok");
  expect((await reviews())?.reviews).toEqual({
    current: 0,
    unknown: 1,
    outdated: 0,
    outstanding: 0,
  });

  const replaced = await saveApplicationReview(db, actor, {
    ...input,
    expectedRevision: edited.revision,
    change: {
      action: "record",
      id: randomUUID(),
      contactId: reviewer.contact.id,
      requestId: null,
      previousId: assessmentId,
      content,
    },
  });
  assert(replaced.status === "ok");
  expect((await reviews())?.reviews).toEqual({
    current: 1,
    unknown: 0,
    outdated: 0,
    outstanding: 0,
  });

  const page = await getFundingRoundPage(db, actor, rounds.pageInput);
  assert.isNotNull(page);
  const revised = await editFundingRound(db, actor, {
    workspaceSlug: "alder",
    publicId: rounds.pageInput.publicId,
    expectedRevision: page.preparation.revision,
    change: {
      section: "criteria",
      criteria: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          title: "Venue",
          description: "Check the replacement venue.",
        },
      ],
    },
  });
  assert(revised.status === "ok");
  expect(await reviews()).toMatchObject({
    criteriaChanged: true,
    reviews: { current: 0, unknown: 0, outdated: 1, outstanding: 0 },
  });
});

it("returns empty authorized workspaces and rechecks grant access on every read", async ({
  db,
  database,
}) => {
  expect(await listWorkspaceApplications(db, actor, "alder")).toEqual({
    status: "ok",
    applications: [],
  });
  expect(await listWorkspaceApplications(db, actor, "birch")).toEqual({ status: "not_found" });
  for (const role of ["reviewer", "committee_reader", "member"]) {
    await database.client.query("UPDATE memberships SET role=$1 WHERE user_id='dana'", [role]);
    expect(await listWorkspaceApplications(db, actor, "alder")).toEqual({ status: "forbidden" });
  }
  await database.client.query("DELETE FROM memberships WHERE user_id='dana'");
  expect(await listWorkspaceApplications(db, actor, "alder")).toEqual({ status: "not_found" });
});

it("keeps unknown applicants distinct from known applicants", async ({
  db,
  rounds: { pageInput },
}) => {
  const created = await createFundingApplication(db, actor, {
    workspaceSlug: pageInput.workspaceSlug,
    publicId: pageInput.publicId,
    requestId: randomUUID(),
    title: "Title only",
  });
  assert(created.status === "ok");
  const result = await listWorkspaceApplications(db, actor, "alder");
  assert(result.status === "ok");
  expect(result.applications).toMatchObject([{ id: created.publicId, applicant: null }]);
});
