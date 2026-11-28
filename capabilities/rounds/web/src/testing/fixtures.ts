import type { PreparationRound } from "../contracts/preparation";

export const makePreparationRound = (
  overrides: Partial<PreparationRound> = {},
): PreparationRound => ({
  title: "Community grants",
  purpose: "Support local projects",
  manager: "Dana Reed",
  budget: null,
  meetingDate: null,
  decisionStatus: "Preparing",
  criteria: [],
  applicationCount: 0,
  criteriaImpact: { assessments: 0, requests: 0 },
  ...overrides,
});
