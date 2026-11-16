import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { roundView, type ApplicationOverview } from "@merit/grantmaking/api";
import { matchesApplicationCriteria } from "@merit/grantmaking/api";
import { makeReviewedApplication, makeRound } from "@merit/grantmaking/testing/fixtures";

import { applicationOverviewForPreview } from "./application-list-preview";

const matchesApplicationFilter = (
  application: ReturnType<typeof example>["application"] | ApplicationOverview,
  filter: Parameters<typeof matchesApplicationCriteria>[1],
) =>
  matchesApplicationCriteria(
    "assessments" in application
      ? applicationOverviewForPreview(roundView(makeRound()), application)
      : application,
    filter,
  );

const example = () => {
  const application = roundView(makeRound({ applications: [makeReviewedApplication()] }))
    .applications[0]!;
  application.version = materialVersionSchema.parse(2);
  application.withdrawal = {
    withdrawnOn: "2027-01-20",
    reason: "Other funding secured.",
    recorder: { userId: "dana", name: "Dana", recordedAt: "2027-01-20T10:00:00Z" },
  };
  const review = application.assessments[0]!;
  application.assessments = [
    { ...review, status: "outdated" },
    { ...review, status: "unknown" },
    { ...review, status: "outstanding" },
  ];
  const overview: ApplicationOverview = {
    id: application.id,
    title: application.title,
    applicant: application.submission?.organization ?? null,
    roundId: "round",
    roundTitle: "Community grants",
    intakeStatus: "ready",
    withdrawn: true,
    requested: null,
    reviews: { current: 0, outdated: 1, unknown: 1, outstanding: 1 },
    criteriaChanged: false,
    recommendation: {
      position: "Fund",
      outdated: true,
      allocation: { minorUnits: "0", currency: "EUR" as const },
    },
  };
  return { application, overview };
};

it("projects round and overview facts into the same application criteria", () => {
  const { application, overview } = example();
  const filter = {
    participation: "withdrawn",
    readiness: "ready",
    reviews: "awaiting",
    evidence: "changed",
  } as const;
  expect(matchesApplicationFilter(application, filter)).toBe(true);
  expect(matchesApplicationFilter(overview, filter)).toBe(true);
  expect(matchesApplicationFilter(application, { ...filter, participation: "active" })).toBe(false);

  application.assessments = [];
  application.managerRecommendation = null;
  expect(
    matchesApplicationFilter(application, { reviews: "unassigned", recommendation: "missing" }),
  ).toBe(true);
  expect(matchesApplicationFilter(application, { evidence: "changed" })).toBe(false);
  application.managerRecommendation = makeReviewedApplication().managerRecommendation;
  application.assessments = [];
  expect(matchesApplicationFilter(application, { evidence: "changed" })).toBe(true);
  const review = example().application.assessments[0]!;
  application.assessments = [{ ...review, status: "current", criteriaChanged: true }];
  application.managerRecommendation = null;
  expect(matchesApplicationFilter(application, { evidence: "changed" })).toBe(true);
});
