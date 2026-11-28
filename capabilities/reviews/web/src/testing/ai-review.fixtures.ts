import { getExampleRound } from "@merit/grantmaking/examples";
import type { AiReviewEntry } from "@merit/reviews/domain";

import type { AiReviewData } from "../contracts/ai-review";

const need = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error("The example application is missing material the fixtures cite");
  }
  return value;
};

const round = getExampleRound();
const application = need(round.applications[0]);
const [connection, demand] = [need(round.criteria[0]), need(round.criteria[1])];
const [meal, pilot] = [
  need(application.submission?.answers[0]),
  need(application.submission?.answers[1]),
];

/** A saved AI review of the first example application, current against its material and criteria. */
export const aiReviewFixture = (overrides: Partial<AiReviewEntry> = {}): AiReviewEntry => ({
  id: "a1000000-0000-4000-8000-000000000001",
  applicationVersion: application.version,
  criteriaVersion: round.criteriaVersion,
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
            { source: meal.questionId, quote: "weekly shared meal over 24 weeks" },
            { source: "title", quote: application.title },
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
          citations: [{ source: pilot.questionId, quote: "We did not count unique people" }],
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
