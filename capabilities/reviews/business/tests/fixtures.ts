import type { z } from "zod";

import { reviewStateSchema, type ReviewState } from "../src/domain/reviews";

export const makeAssessment = (
  overrides: Partial<z.input<typeof reviewStateSchema>["assessments"][number]> = {},
): ReviewState["assessments"][number] =>
  reviewStateSchema.shape.assessments.element.parse({
    id: "2c92018b-fcad-5d1e-b25c-1fa6430a57af",
    contactId: "reviewer",
    reviewer: "Sam",
    requestId: null,
    previousId: null,
    versions: [
      {
        content: {
          applicationVersion: 1,
          criteriaVersion: 1,
          date: null,
          position: null,
          amount: null,
          reasoning: "The proposal addresses a local need.",
          observations: [],
        },
        criteria: [],
        recorder: null,
        note: "",
      },
    ],
    ...overrides,
  });

export const makeReviewRequest = (
  overrides: Partial<z.input<typeof reviewStateSchema>["requests"][number]> = {},
): ReviewState["requests"][number] =>
  reviewStateSchema.shape.requests.element.parse({
    id: "2c343adf-a49f-50bd-8d8d-6c676aec4bdc",
    contactId: "reviewer",
    reviewer: "Sam",
    applicationVersion: 1,
    criteriaVersion: 1,
    criteria: [],
    status: "outstanding",
    recorder: null,
    closedBy: null,
    ...overrides,
  });
