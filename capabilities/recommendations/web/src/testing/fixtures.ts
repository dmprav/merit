import { materialVersionSchema } from "@merit/applications/domain";
import { fromMinorUnits } from "@merit/money";

import type { RecommendationApplication, RecommendationRound } from "../contracts/recommendations";

export const application: RecommendationApplication = {
  title: "Community meals",
  version: materialVersionSchema.parse(1),
  requested: fromMinorUnits(2400000n),
  intakeStatus: "ready",
  managerRecommendation: {
    position: "Fund",
    allocation: fromMinorUnits(2400000n),
    reasoning: "Support weekly meals for the neighbourhood.",
  },
};
export const round: RecommendationRound = {
  manager: "Dana Reed",
  budget: fromMinorUnits(6000000n),
  // €24,000 for this application and €28,000 allocated to other applications.
  totals: {
    proposed: fromMinorUnits(5200000n),
    withdrawnApplications: 0,
  },
};
