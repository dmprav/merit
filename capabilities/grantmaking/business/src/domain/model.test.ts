import { expect, it } from "vite-plus/test";

import { makeApplication, makeRound } from "../../tests/fixtures";
import { fundingRoundOverviewSchema } from "./model";

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
