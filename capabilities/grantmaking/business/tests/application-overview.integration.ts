import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { createFundingApplication } from "@merit/applications/server";
import { getFundingRoundPage, listWorkspaceApplications } from "@merit/grantmaking/server";
import { fundingExampleIds } from "@merit/grantmaking/server/demo";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { actor } from "@merit/organizations/testing/workspace";
import { saveApplicationReview } from "@merit/reviews/server";
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

it("uses the latest assessment version and counts a replacement only once", async ({ db }) => {
  await seedExampleRounds(db);
  const { roundId } = await fundingExampleIds("alder");
  const page = await getFundingRoundPage(db, actor, {
    workspaceSlug: "alder",
    publicId: roundId,
    kind: "round",
  });
  assert.isNotNull(page);
  const application = page.round.applications[0]!;
  const assessment = application.reviews.assessments[0]!;
  const content = {
    ...assessment.versions.at(-1)!.content,
    applicationVersion: null,
    criteriaVersion: null,
  };
  const input = {
    workspaceSlug: "alder",
    publicId: application.id,
    expectedRevision: application.reviews.revision,
    expectedApplicationVersion: application.version,
    expectedCriteriaVersion: page.round.criteriaVersion,
  };
  const edited = await saveApplicationReview(db, actor, {
    ...input,
    change: { action: "edit", id: assessment.id, content, note: "Basis not supplied" },
  });
  assert(edited.status === "ok");
  let result = await listWorkspaceApplications(db, actor, "alder");
  assert(result.status === "ok");
  expect(result.applications.find((item) => item.id === application.id)?.reviews).toEqual({
    current: 1,
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
      contactId: assessment.contactId,
      requestId: null,
      previousId: assessment.id,
      content: assessment.versions.at(-1)!.content,
    },
  });
  assert(replaced.status === "ok");
  result = await listWorkspaceApplications(db, actor, "alder");
  assert(result.status === "ok");
  expect(result.applications.find((item) => item.id === application.id)?.reviews).toEqual({
    current: 2,
    unknown: 0,
    outdated: 0,
    outstanding: 0,
  });
  const revised = await editFundingRound(db, actor, {
    workspaceSlug: "alder",
    publicId: roundId,
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
  result = await listWorkspaceApplications(db, actor, "alder");
  assert(result.status === "ok");
  expect(result.applications.find((item) => item.id === application.id)).toMatchObject({
    criteriaChanged: true,
    reviews: { current: 0, unknown: 0, outdated: 2, outstanding: 0 },
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
