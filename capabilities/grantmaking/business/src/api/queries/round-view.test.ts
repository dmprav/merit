import { assert, expect, it } from "vite-plus/test";

import { fromMinorUnits, encodeMoney } from "@merit/money";

import {
  makeApplication,
  makeAssessment,
  makeReviewRequest,
  makeRound,
  makeReviewedApplication,
} from "../../../tests/fixtures";
import { encodeRoundOverview } from "../encoding";
import { applicationView, decodeRoundView, roundView } from "./round-view";

it("recomputes exact totals from JSON records instead of accepting supplied totals", () => {
  const round = makeRound({
    budget: fromMinorUnits(9007199254740993n),
    applications: [
      { ...makeReviewedApplication(), requested: fromMinorUnits(9007199254740995n) },
      makeApplication({
        id: "sibling",
        requested: fromMinorUnits(5000000n),
        managerRecommendation: {
          position: "Fund",
          allocation: fromMinorUnits(3200000n),
          reasoning: "Sibling allocation",
        },
      }),
    ],
  });
  const data = encodeRoundOverview(roundView(round));
  const tampered = {
    ...data,
    totals: { remaining: { minorUnits: "0", currency: "EUR" } },
  };
  const parsed: unknown = JSON.parse(JSON.stringify(tampered));
  const decoded = decodeRoundView(parsed);

  expect(data).not.toHaveProperty("totals");
  expect(data.applications.every((item) => !("assessments" in item))).toBe(true);
  expect(encodeRoundOverview(decoded)).toEqual(data);
  expect(data.budget!.minorUnits).toBe("9007199254740993");
  expect(encodeMoney(decoded.totals.requested).minorUnits).toBe("9007199259740995");
  expect(encodeMoney(decoded.totals.remaining!).minorUnits).toBe("9007199249540993");
});

it("rebuilds assessment displays from review records even when JSON supplies an empty display list", () => {
  const assessment = makeAssessment({ id: "sam-assessment", reviewer: "Sam" });
  const application = makeApplication({
    reviews: { revision: 1, requests: [], assessments: [assessment] },
  });
  const data = encodeRoundOverview(makeRound({ applications: [application] }));
  const encodedApplication = data.applications[0];
  assert.isDefined(encodedApplication);

  const restored = decodeRoundView({
    ...data,
    applications: [{ ...encodedApplication, assessments: [] }],
  });

  expect(restored.applications[0]?.assessments).toMatchObject([
    {
      id: "sam-assessment",
      reviewer: "Sam",
      status: "current",
      submission: { reasoning: "The proposal addresses a local need.", applicationVersion: 1 },
    },
  ]);
  expect(restored.applications[0]?.reviews).toEqual(application.reviews);
});

it("preserves criteria when reconstructing and re-encoding a round view", () => {
  const criteria = [
    {
      id: "7bb21220-ecc6-5a1b-9eec-1a47e5e66bc4",
      title: "Local benefit",
      description: "Explain who benefits.",
    },
    { id: "c21dce51-35aa-5293-bd64-f2b7a8234f11", title: "Additional context" },
  ];
  const data = encodeRoundOverview(
    roundView(makeRound({ criteria, criteriaHistory: [{ version: 1, criteria }] })),
  );

  const restored = decodeRoundView(JSON.parse(JSON.stringify(data)));

  expect(restored.criteria).toEqual(criteria);
  expect(encodeRoundOverview(restored)).toEqual(data);
});

it("shows an outstanding follow-up beside a judgment on an earlier material version", () => {
  const application = makeApplication({
    version: 2,
    reviews: {
      revision: 2,
      assessments: [makeAssessment()],
      requests: [makeReviewRequest({ id: "follow-up", applicationVersion: 2 })],
    },
  });

  expect(applicationView(application, []).assessments).toMatchObject([
    { id: "assessment", status: "outdated" },
    { id: "follow-up", status: "outstanding" },
  ]);
});

it("shows the latest follow-up judgment in place of the superseded assessment", () => {
  const earlier = makeAssessment();
  const version = earlier.versions[0];
  assert.isDefined(version);
  const later = makeAssessment({
    id: "later",
    previousId: earlier.id,
    versions: [{ ...version, content: { ...version.content, applicationVersion: 2 } }],
  });
  const application = makeApplication({
    version: 2,
    reviews: { revision: 2, requests: [], assessments: [earlier, later] },
  });

  expect(applicationView(application, []).assessments).toMatchObject([
    { id: "later", status: "current" },
  ]);
});

it("marks a received assessment with unknown material and criteria as unknown", () => {
  const assessment = makeAssessment();
  const version = assessment.versions[0];
  assert.isDefined(version);
  assessment.versions = [
    {
      ...version,
      criteria: null,
      content: { ...version.content, applicationVersion: null, criteriaVersion: null },
    },
  ];
  const application = makeApplication({
    reviews: { revision: 1, requests: [], assessments: [assessment] },
  });

  expect(applicationView(application).assessments).toMatchObject([
    { status: "unknown", criteriaUnknown: true },
  ]);
});

it("marks an assessment outdated when the current criteria differ from its recorded criteria", () => {
  const assessment = makeAssessment();
  const version = assessment.versions[0];
  assert.isDefined(version);
  assessment.versions = [
    { ...version, criteria: [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }] },
  ];
  const application = makeApplication({
    reviews: { revision: 1, requests: [], assessments: [assessment] },
  });

  expect(
    applicationView(application, [
      { id: "0630f26c-0567-518f-a61b-cbb1752ff2df", title: "New criterion" },
    ]).assessments,
  ).toMatchObject([{ criteriaChanged: true, status: "outdated" }]);
  expect(application.reviews.requests).toEqual([]);
});

it("counts judgments on earlier material as outdated while retaining the manager allocation", () => {
  const application = makeReviewedApplication();
  application.version = makeApplication({ version: 2 }).version;

  const view = roundView(makeRound({ applications: [application] }));

  expect(view.totals.reviews.outdated).toBe(2);
  expect(view.totals.proposed).toEqual(fromMinorUnits(2000000n));
});

it("does not label a known assessment current without current criteria to compare", () => {
  const application = makeApplication({
    reviews: { revision: 1, requests: [], assessments: [makeAssessment()] },
  });
  expect(applicationView(application).assessments).toMatchObject([
    {
      status: "unknown",
      criteriaChanged: false,
      criteriaUnknown: true,
      basisComparison: { criteriaContent: "unknown", criteriaVersion: "unknown" },
    },
  ]);
});
