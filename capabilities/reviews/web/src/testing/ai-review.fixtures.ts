import { materialVersionSchema } from "@merit/applications/domain";
import type { AiReviewEntry } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import type { AiReviewData } from "../contracts/ai-review";

/*
 * The first example application ("Neighbour Table", version 1) and its round's first two criteria
 * (criteria version 1), copied from the grantmaking example round. Reviews cannot depend on
 * grantmaking, so the fixture repeats the identifiers and wording its citations need.
 */
const application = { version: materialVersionSchema.parse(1), title: "Neighbour Table" };
const criteriaVersion = criteriaVersionSchema.parse(1);
const connection = { id: "c71be2aa-4794-4f1d-b5b7-6e656c2fa086", title: "Community connection" };
const demand = { id: "59a76eae-9d64-4766-b2c5-7cf48aa710bf", title: "Evidence of demand" };
const meal = { questionId: "ea6818f9-940d-417b-b094-ed0c0d145f5b", question: "Project overview" };
const pilot = { questionId: "31512cd2-519b-4baa-b9af-f8870df5c084", question: "Community need" };

/** A saved AI review of the first example application, current against its material and criteria. */
export const aiReviewFixture = (overrides: Partial<AiReviewEntry> = {}): AiReviewEntry => ({
  id: "a1000000-0000-4000-8000-000000000001",
  applicationVersion: application.version,
  criteriaVersion,
  provider: "OpenAI",
  model: "gpt-5.1",
  runBy: { userId: "dana", name: "Dana Reed" },
  provenance: { interface: "web" },
  recordedAt: "2027-01-18T09:30:00Z",
  position: "Fund",
  amount: { minorUnits: "2400000", currency: "EUR" },
  reasoning:
    "The application meets the connection and readiness criteria clearly and is honest about the limits of its demand evidence. Funding the full request is reasonable if reporting covers unique participants.",
  criteria: [
    {
      criterionId: connection.id,
      title: connection.title,
      claims: [
        {
          text: "A weekly shared meal gives residents a regular reason to meet over 24 weeks.",
          citations: [
            {
              source: meal.questionId,
              quote: "weekly shared meal over 24 weeks",
              label: meal.question,
            },
            { source: "title", quote: application.title, label: null },
          ],
        },
      ],
      gaps: ["The application does not say what will keep connections going after the 24 weeks."],
      strengths: ["A clear focus on people who find it hard to take part."],
      weaknesses: [],
      concerns: [],
    },
    {
      criterionId: demand.id,
      title: demand.title,
      claims: [
        {
          text: "The pilot's attendance figure cannot show how many different residents it reached.",
          citations: [
            {
              source: pilot.questionId,
              quote: "We did not count unique people",
              label: pilot.question,
            },
          ],
        },
      ],
      gaps: ["Unique participants and repeat attendance in the pilot are unknown."],
      strengths: [],
      weaknesses: ["Only 18 attendees gave feedback."],
      concerns: ["Demand may be narrower than the attendance suggests."],
    },
  ],
  questions: [
    "How many different residents attended the six-session pilot?",
    "What will help people keep meeting after the 24 weeks end?",
  ],
  basisComparison: { applicationVersion: "same", criteriaVersion: "same", criteriaContent: "same" },
  freshness: "current",
  ...overrides,
});

/** The same review after the application changed. */
export const outdatedAiReviewFixture = (overrides: Partial<AiReviewEntry> = {}) =>
  aiReviewFixture({
    freshness: "outdated",
    basisComparison: {
      applicationVersion: "different",
      criteriaVersion: "same",
      criteriaContent: "same",
    },
    ...overrides,
  });

export const earlierAiReviewFixture = (overrides: Partial<AiReviewEntry> = {}) =>
  outdatedAiReviewFixture({
    id: "a1000000-0000-4000-8000-000000000002",
    recordedAt: "2027-01-12T14:05:00Z",
    position: "Fund with a condition",
    amount: { minorUnits: "1800000", currency: "EUR" },
    ...overrides,
  });

const aiReviewProvider = { provider: "OpenAI", model: "gpt-5.1" };

/** Page data for an application with no AI review, ready to run one. */
export const aiReviewDataFixture = (overrides: Partial<AiReviewData> = {}): AiReviewData => ({
  reviews: [],
  availability: "available",
  provider: aiReviewProvider,
  run: async () => ({ status: "failed" }),
  refresh: async () => {},
  ...overrides,
});
