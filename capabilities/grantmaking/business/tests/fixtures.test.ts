import { assert, expect, it } from "vite-plus/test";

import { roundView } from "../src/api/queries/round-view";
import { fundingRoundOverviewSchema } from "../src/domain/model";
import { makeApplication, makeRound, makeReviewedApplication } from "./fixtures";

it("starts reviewed applications with a consistent basis and independent nested data", () => {
  const application = makeReviewedApplication();
  const round = makeRound({ applications: [application] });

  expect(fundingRoundOverviewSchema.safeParse(round).success).toBe(true);

  const view = roundView(round).applications[0];

  assert.isDefined(view);
  expect(view.assessments.map((value) => value.status)).toEqual(["current", "current"]);

  assert.isDefined(application.submission);
  assert.isDefined(application.submission.answers[0]);
  assert.isDefined(application.reviews.assessments[0]);
  assert.isDefined(application.reviews.assessments[0].versions[0]);
  assert.isDefined(round.criteriaHistory[0]);

  application.submission.answers[0].response = "Changed submission";
  application.reviews.assessments[0].versions[0].content.applicationVersion = makeApplication({
    version: 99,
  }).version;
  round.criteriaHistory[0].criteria.push({
    id: "7c856d26-684d-5a0f-80b7-b5b3eb55fc44",
    title: "Changed criteria",
  });
  const next = makeRound({ applications: [makeReviewedApplication()] });
  const nextApplication = next.applications[0];

  assert.isDefined(nextApplication);
  assert.isDefined(nextApplication.submission);
  assert.isDefined(nextApplication.submission.answers[0]);
  expect(nextApplication.submission.answers[0].response).toBe("Weekly community meals.");

  const nextView = roundView(next).applications[0];

  assert.isDefined(nextView);
  expect(nextView.assessments.map((value) => value.status)).toEqual(["current", "current"]);

  const incomplete = makeApplication();
  incomplete.reviews.assessments.push(application.reviews.assessments[0]);

  expect(makeApplication().reviews.assessments).toEqual([]);
});
