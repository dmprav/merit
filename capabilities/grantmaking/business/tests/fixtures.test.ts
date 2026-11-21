import { assert, expect, it } from "vite-plus/test";

import { roundView } from "../src/api/queries/round-view";
import { fundingRoundOverviewSchema } from "../src/domain/model";
import { makeApplication, makeRound, makeReviewedApplication } from "./fixtures";

it("starts reviewed applications with a valid round and current assessments", () => {
  const round = makeRound({ applications: [makeReviewedApplication()] });

  expect(fundingRoundOverviewSchema.safeParse(round).success).toBe(true);
  expect(roundView(round).applications[0]?.assessments.map((value) => value.status)).toEqual([
    "current",
    "current",
  ]);
});

it("allocates fresh nested data for each reviewed round", () => {
  const application = makeReviewedApplication();
  const round = makeRound({ applications: [application] });
  assert.isDefined(application.submission?.answers[0]);
  assert.isDefined(application.reviews.assessments[0]?.versions[0]);
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

  expect(next.applications[0]?.submission?.answers[0]?.response).toBe("Weekly community meals.");
  expect(next.criteriaHistory).toEqual([{ version: 1, criteria: [] }]);
  expect(roundView(next).applications[0]?.assessments.map((value) => value.status)).toEqual([
    "current",
    "current",
  ]);
});

it("allocates fresh review lists for each incomplete application", () => {
  const assessment = makeReviewedApplication().reviews.assessments[0];
  assert.isDefined(assessment);
  makeApplication().reviews.assessments.push(assessment);

  expect(makeApplication().reviews.assessments).toEqual([]);
});
