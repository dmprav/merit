import { assert, expect, it } from "vite-plus/test";

import { makeApplication, makeAssessment, makeRound } from "../../tests/fixtures";
import { fundingRoundOverviewSchema } from "./model";

it.each([
  { position: "Defer", amount: "1.00", valid: false },
  { position: "Fund", amount: "0.00", valid: false },
  { position: "Fund with a condition", amount: "10000.00", valid: true },
  { position: "Fund €24,000", amount: null, valid: false },
])(
  "validates a recorded reviewer outcome: $position with $amount is valid=$valid",
  ({ position, amount, valid }) => {
    const assessment = makeAssessment();
    const version = assessment.versions[0];
    assert.isDefined(version);
    const application = makeApplication({
      reviews: { revision: 1, requests: [], assessments: [] },
    });
    const record = {
      ...application,
      reviews: {
        ...application.reviews,
        assessments: [
          {
            ...assessment,
            versions: [{ ...version, content: { ...version.content, position, amount } }],
          },
        ],
      },
    };

    expect(
      fundingRoundOverviewSchema.safeParse(makeRound({ applications: [application] })).success,
    ).toBe(true);
    expect(
      fundingRoundOverviewSchema.safeParse({ ...makeRound(), applications: [record] }).success,
    ).toBe(valid);
  },
);

it("accepts an application without a manager recommendation", () => {
  const round = makeRound({ applications: [makeApplication({ managerRecommendation: null })] });

  expect(fundingRoundOverviewSchema.parse(round).applications[0]?.managerRecommendation).toBeNull();
});

it("preserves submitted responses when validating a round", () => {
  const submission = {
    version: 1,
    answers: [
      {
        questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
        question: "Purpose",
        response: "Community meals",
      },
    ],
  };
  const round = makeRound({ applications: [makeApplication({ submission })] });

  expect(fundingRoundOverviewSchema.parse(round).applications[0]?.submission).toEqual(submission);
});

it("accepts an application whose material has not been supplied", () => {
  const application = makeApplication();
  delete application.submission;

  expect(
    fundingRoundOverviewSchema.safeParse(makeRound({ applications: [application] })).success,
  ).toBe(true);
});
