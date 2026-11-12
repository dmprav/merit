import { fromMinorUnits, type Money } from "@merit/money";

import type { IntakeApplication } from "../src/domain/model";
import { materialVersionSchema } from "../src/domain/versions";

export type ApplicationRecord = IntakeApplication & {
  reviews: { revision: number; requests: unknown[]; assessments: unknown[] };
  managerRecommendation: {
    position: "Fund";
    allocation: Money;
    reasoning: string;
    recorded?: { date: string; applicationVersion: number };
  } | null;
};

export const makeApplication = (overrides: Partial<ApplicationRecord> = {}): ApplicationRecord => ({
  id: "application",
  title: "Community project",
  version: materialVersionSchema.parse(1),
  requested: null,
  intakeStatus: "in_preparation",
  submission: { version: overrides.version ?? 1, answers: [] },
  summary: "",
  evidence: [],
  contactId: null,
  attention: [],
  reviews: { revision: 0, requests: [], assessments: [] },
  managerRecommendation: null,
  ...overrides,
});

export const makeReviewedApplication = () =>
  makeApplication({
    intakeStatus: "ready",
    requested: fromMinorUnits(2400000n),
    submission: {
      version: 1,
      organization: "Neighbourhood Kitchen",
      answers: [
        {
          questionId: "10000000-0000-4000-8000-000000000001",
          question: "Project",
          response: "Weekly community meals.",
        },
      ],
    },
    reviews: {
      revision: 2,
      requests: [],
      assessments: [{ id: "assessment" }, { id: "second-assessment" }],
    },
    managerRecommendation: {
      position: "Fund",
      allocation: fromMinorUnits(2000000n),
      reasoning: "Support the proposed meals.",
      recorded: { date: "2027-01-18", applicationVersion: 1 },
    },
  });
