import { aiReviewOutputSchema, type AiReviewOutput } from "@merit/reviews/domain";

import { exampleRound } from "./example-data";

/** Prepared AI reviews of the fictional applications. The demo never calls a provider. Every quote
 * is verbatim from the matching example material, which the examples test verifies. */
export const exampleAiReviewProvider = { provider: "Example", model: "Prepared example" } as const;

// The review schema rejects a missing criterion ID when the module loads.
const [connection, demand, readiness, budget] = exampleRound.criteria.map(({ id }) => id);

const review = (value: unknown): AiReviewOutput => aiReviewOutputSchema.parse(value);

export const exampleAiReviews: Record<string, AiReviewOutput> = {
  A1: review({
    criteria: [
      {
        criterionId: connection,
        claims: [
          {
            text: "A weekly shared meal gives residents a regular reason to meet over 24 weeks.",
            citations: [
              {
                source: "ea6818f9-940d-417b-b094-ed0c0d145f5b",
                quote: "weekly shared meal over 24 weeks",
              },
              {
                source: "ea6818f9-940d-417b-b094-ed0c0d145f5b",
                quote: "cooking, a low-cost lunch and facilitated conversation",
              },
            ],
          },
          {
            text: "The programme is aimed at adults who are isolated today.",
            citations: [
              {
                source: "ea6818f9-940d-417b-b094-ed0c0d145f5b",
                quote: "adults living alone who do not currently attend community activities",
              },
            ],
          },
        ],
        gaps: ["The application does not say what will keep connections going after the 24 weeks."],
        strengths: ["A clear focus on people who find it hard to take part."],
        weaknesses: [],
        concerns: [],
      },
      {
        criterionId: demand,
        claims: [
          {
            text: "The pilot's attendance figure cannot show how many different residents it reached.",
            citations: [
              {
                source: "31512cd2-519b-4baa-b9af-f8870df5c084",
                quote: "We did not count unique people",
              },
            ],
          },
          {
            text: "Most of the attendees who gave feedback said they would return.",
            citations: [
              {
                source: "31512cd2-519b-4baa-b9af-f8870df5c084",
                quote: "Of the 18 attendees who gave feedback, 14 said they would return",
              },
            ],
          },
        ],
        gaps: ["Unique participants and repeat attendance in the pilot are unknown."],
        strengths: ["The applicant is open about the limits of its pilot data."],
        weaknesses: ["Only 18 attendees gave feedback."],
        concerns: [],
      },
      {
        criterionId: readiness,
        claims: [
          {
            text: "The venue dates are confirmed.",
            citations: [
              {
                source: "6cf6d5da-fb0f-4da3-9268-49f572a9c7b7",
                quote: "The community hall has confirmed all 24 dates",
              },
            ],
          },
          {
            text: "A coordinator and volunteers are named to run the meals.",
            citations: [
              {
                source: "6cf6d5da-fb0f-4da3-9268-49f572a9c7b7",
                quote: "Our coordinator and eight volunteers will prepare the meals",
              },
            ],
          },
        ],
        gaps: [],
        strengths: ["Venue and people are in place before funding."],
        weaknesses: [],
        concerns: [],
      },
      {
        criterionId: budget,
        claims: [
          {
            text: "The request is itemised and food is the largest line.",
            citations: [
              { source: "requested", quote: "24000.00 EUR" },
              {
                source: "e327abe8-f952-4789-ac6d-3a6e5e02d8f4",
                quote: "Food and supplies: €9600.00",
              },
            ],
          },
        ],
        gaps: ["The cost per meal is not shown."],
        strengths: ["The itemised budget accounts for the whole request."],
        weaknesses: [],
        concerns: [],
      },
    ],
    questions: [
      "How many different residents attended the six-session pilot?",
      "What will help people keep meeting after the 24 weeks end?",
      "What is the expected cost per meal?",
    ],
    reasoning:
      "The application meets the connection and readiness criteria clearly and is honest about the limits of its demand evidence. The missing unique-participant count is a gap, not a reason to withhold funding, because the applicant commits to recording it. Funding the full request is reasonable if reporting covers unique participants and repeat attendance.",
    position: "Fund",
    amount: { minorUnits: "2400000", currency: "EUR" },
  }),
  A2: review({
    criteria: [
      {
        criterionId: connection,
        claims: [
          {
            text: "Shared journeys are meant to build connections as well as reach activities.",
            citations: [
              {
                source: "36aea6a2-7b4a-4a5e-8477-125ca5a9df7a",
                quote: "help people build regular connections as well as reach an activity",
              },
            ],
          },
        ],
        gaps: ["The application does not describe how riders will meet each other on the trips."],
        strengths: ["Booking support for people who do not use online booking."],
        weaknesses: [],
        concerns: [],
      },
      {
        criterionId: demand,
        claims: [
          {
            text: "A survey shows transport is a barrier for most prospective participants.",
            citations: [
              {
                source: "175e707e-8d89-4651-bd08-69146f9aa638",
                quote: "25 had missed an activity because they could not arrange transport",
              },
            ],
          },
        ],
        gaps: [],
        strengths: ["Direct evidence from the people the project is for."],
        weaknesses: ["The survey covers 32 people."],
        concerns: [],
      },
      {
        criterionId: readiness,
        claims: [
          {
            text: "The accessible vehicle is not yet secured.",
            citations: [
              {
                source: "e2464d09-3011-403c-997c-fe283eb1d51f",
                quote: "dates and availability are not yet confirmed",
              },
            ],
          },
        ],
        gaps: ["There is no written confirmation from the transport provider."],
        strengths: [],
        weaknesses: ["The delivery plan depends on a vehicle that is not confirmed."],
        concerns: ["The transport budget is provisional."],
      },
      {
        criterionId: budget,
        claims: [
          {
            text: "Transport is most of the request, and the applicant calls it provisional.",
            citations: [
              {
                source: "a52bcc23-89f2-43e3-9a21-d79e1dba80c1",
                quote: "Accessible transport: €20000.00",
              },
              {
                source: "e2464d09-3011-403c-997c-fe283eb1d51f",
                quote: "The transport budget is provisional until we have written confirmation",
              },
            ],
          },
        ],
        gaps: ["The price per trip is not stated."],
        strengths: [],
        weaknesses: [],
        concerns: ["Most of the request rests on a quote the applicant has not confirmed."],
      },
    ],
    questions: [
      "When can the transport provider confirm dates, availability and price in writing?",
      "How will riders meet one another on the trips?",
      "What is the cost per trip?",
    ],
    reasoning:
      "The need is well evidenced and the project fits the round, but delivery and most of the budget depend on a provider that has not confirmed. A funding position with a condition fits: reserve the amount and proceed once the provider confirms in writing.",
    position: "Fund with a condition",
    amount: { minorUnits: "2800000", currency: "EUR" },
  }),
  A3: review({
    criteria: [
      {
        criterionId: connection,
        claims: [
          {
            text: "The social element is central to the workshops.",
            citations: [
              {
                source: "5ad15526-e641-4b78-8d69-a37261a2a3f9",
                quote: "the social element is as important to us as finishing a repair",
              },
            ],
          },
        ],
        gaps: [],
        strengths: ["Tea breaks and shared projects build in time to talk."],
        weaknesses: [],
        concerns: [],
      },
      {
        criterionId: demand,
        claims: [
          {
            text: "Interest is real but not yet confirmed.",
            citations: [
              {
                source: "3f540e1d-ce19-4e97-aa88-9db6bbc4a476",
                quote: "These are expressions of interest rather than confirmed bookings",
              },
            ],
          },
        ],
        gaps: ["No bookings or deposits confirm the 27 expressions of interest."],
        strengths: [],
        weaknesses: [],
        concerns: [],
      },
      {
        criterionId: readiness,
        claims: [
          {
            text: "The replacement venue is not booked, so dates are not fixed.",
            citations: [
              {
                source: "282b068c-b066-4bbb-926c-4da54b0b1494",
                quote: "The replacement venue has not yet been booked",
              },
            ],
          },
        ],
        gaps: ["Session dates and venue are unconfirmed."],
        strengths: [],
        weaknesses: ["The plan changed after the free venue was lost."],
        concerns: ["Bookings cannot open until the venue is confirmed."],
      },
      {
        criterionId: budget,
        claims: [
          {
            text: "The request rose by €4,000 for venue hire.",
            citations: [
              {
                source: "282b068c-b066-4bbb-926c-4da54b0b1494",
                quote: "bringing our request from €18,000 to €22,000",
              },
              { source: "requested", quote: "22000.00 EUR" },
            ],
          },
        ],
        gaps: ["The venue cost is an estimate until the venue is booked."],
        strengths: [],
        weaknesses: [],
        concerns: ["The revised request is a fifth larger for the same activities."],
      },
    ],
    questions: [
      "Which venue will you book, and when will it be confirmed?",
      "How many of the 27 people have said they will definitely attend?",
    ],
    reasoning:
      "The idea suits the round, but the revised request depends on a venue that has not been booked and on interest that has not been confirmed. Deferring until the venue and dates are known lets a decision rest on firm costs.",
    position: "Defer",
    amount: { minorUnits: "0", currency: "EUR" },
  }),
};
