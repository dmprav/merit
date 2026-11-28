import { assert, expect, it } from "vite-plus/test";

import { fromMinorUnits, encodeMoney } from "@merit/money";

import {
  makeApplication,
  makeAssessment,
  makeRound,
  makeReviewedApplication,
} from "../../../tests/fixtures";
import { encodeRoundOverview } from "../../domain/encoding";
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
  const assessment = makeAssessment({ reviewer: "Sam" });
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
      id: assessment.id,
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
