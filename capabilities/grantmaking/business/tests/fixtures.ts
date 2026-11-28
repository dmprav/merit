import type { z } from "zod";

import { fromMinorUnits } from "@merit/money";
import { emptyReviews } from "@merit/reviews/domain";
import { makeAssessment } from "@merit/reviews/testing/fixtures";

import {
  applicationRecordSchema,
  fundingRoundOverviewSchema,
  type ApplicationRecord,
  type FundingRoundOverview,
} from "../src/domain/model";

export { makeAssessment, makeReviewRequest } from "@merit/reviews/testing/fixtures";

export const makeApplication = (
  overrides: Partial<z.input<typeof applicationRecordSchema>> = {},
): ApplicationRecord =>
  applicationRecordSchema.parse({
    id: "application",
    title: "Community project",
    version: 1,
    requested: null,
    intakeStatus: "in_preparation",
    submission: { version: overrides.version ?? 1, answers: [] },
    summary: "",
    evidence: [],
    reviews: emptyReviews(),
    contactId: null,
    managerRecommendation: null,
    attention: [],
    ...overrides,
  });

export const makeRound = (
  overrides: Partial<z.input<typeof fundingRoundOverviewSchema>> = {},
): FundingRoundOverview =>
  fundingRoundOverviewSchema.parse({
    id: "round",
    title: "Community grants",
    foundation: "Foundation",
    purpose: "",
    manager: "Dana",
    currency: "EUR",
    budget: null,
    meetingDate: null,
    snapshotDate: "2027-01-18",
    decisionStatus: "Preparing",
    criteria: [],
    criteriaVersion: 1,
    criteriaHistory: [{ version: 1, criteria: [] }],
    applications: [],
    ...overrides,
  });

export const makeReviewedApplication = (): ApplicationRecord =>
  makeApplication({
    intakeStatus: "ready",
    requested: fromMinorUnits(2400000n),
    submission: {
      version: 1,
      organization: "Neighbourhood Kitchen",
      answers: [
        {
          questionId: "b937389f-e701-5a56-9edc-9d3e00217292",
          question: "Project",
          response: "Weekly community meals.",
        },
      ],
    },
    reviews: {
      revision: 2,
      requests: [],
      assessments: [
        makeAssessment(),
        makeAssessment({
          id: "5610ec59-1988-54b5-800b-3d45b6f9f3d2",
          contactId: "second-reviewer",
          reviewer: "Jules",
        }),
      ],
    },
    managerRecommendation: {
      position: "Fund",
      allocation: fromMinorUnits(2000000n),
      reasoning: "Support the proposed meals.",
      recorded: { date: "2027-01-18", applicationVersion: 1 },
    },
  });
