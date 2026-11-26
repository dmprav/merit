import { assert, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { roundView } from "@merit/grantmaking/api";
import { makeReviewedApplication, makeRound } from "@merit/grantmaking/testing/fixtures";

import { applicationOverviewForPreview } from "./application-list-preview";

const secondVersion = materialVersionSchema.parse(2);

const reviewedView = () => {
  const round = roundView(makeRound({ applications: [makeReviewedApplication()] }));
  const application = round.applications[0];
  assert.isDefined(application);
  return { round, application };
};

it("projects a round view application into the overview record the workspace list returns", () => {
  const { round, application } = reviewedView();
  const review = application.assessments[0];
  assert.isDefined(review);
  application.withdrawal = {
    withdrawnOn: "2027-01-20",
    reason: "Other funding secured.",
    recorder: { userId: "dana", name: "Dana", recordedAt: "2027-01-20T10:00:00Z" },
  };
  application.assessments = [
    { ...review, status: "outdated" },
    { ...review, status: "unknown" },
    { ...review, status: "outstanding" },
  ];

  expect(applicationOverviewForPreview(round, application)).toEqual({
    id: "application",
    title: "Community project",
    applicant: "Neighbourhood Kitchen",
    roundId: "round",
    roundTitle: "Community grants",
    withdrawn: true,
    intakeStatus: "ready",
    requested: { minorUnits: "2400000", currency: "EUR" },
    reviews: { current: 0, outdated: 1, unknown: 1, outstanding: 1 },
    criteriaChanged: false,
    decision: null,
    recommendation: {
      position: "Fund",
      allocation: { minorUnits: "2000000", currency: "EUR" },
      outdated: false,
    },
  });
});

it("leaves applicant, amount, and recommendation empty when none are recorded", () => {
  const { round, application } = reviewedView();
  delete application.submission;
  application.requested = null;
  application.managerRecommendation = null;

  expect(applicationOverviewForPreview(round, application)).toMatchObject({
    applicant: null,
    requested: null,
    recommendation: null,
  });
});

it("keeps a recommendation recorded against the current version current", () => {
  const { round, application } = reviewedView();
  assert.isNotNull(application.managerRecommendation);
  application.version = secondVersion;
  application.managerRecommendation.recorded = { date: "2027-01-18", applicationVersion: 2 };

  expect(applicationOverviewForPreview(round, application).recommendation?.outdated).toBe(false);
});

it("does not call a recommendation with an unknown basis outdated", () => {
  const { round, application } = reviewedView();
  assert.isNotNull(application.managerRecommendation);
  application.version = secondVersion;
  delete application.managerRecommendation.recorded;

  expect(applicationOverviewForPreview(round, application).recommendation?.outdated).toBe(false);
});

it("marks a recommendation recorded against an earlier version as outdated", () => {
  const { round, application } = reviewedView();
  application.version = secondVersion;

  expect(applicationOverviewForPreview(round, application).recommendation?.outdated).toBe(true);
});

it("reports changed criteria when any assessment used earlier criteria", () => {
  const { round, application } = reviewedView();
  const [first, second] = application.assessments;
  assert.isDefined(first);
  assert.isDefined(second);
  application.assessments = [first, { ...second, criteriaChanged: true }];

  expect(applicationOverviewForPreview(round, application).criteriaChanged).toBe(true);
});
