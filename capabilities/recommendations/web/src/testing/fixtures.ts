import { materialVersionSchema } from "@merit/applications/domain";
import { add, fromMinorUnits } from "@merit/money";

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

const proposedElsewhere = fromMinorUnits(2800000n);

export const roundForRecommendation = (
  saved: RecommendationApplication["managerRecommendation"],
): RecommendationRound => ({
  manager: "Dana Reed",
  budget: fromMinorUnits(6000000n),
  totals: {
    proposed: saved ? add(proposedElsewhere, saved.allocation) : proposedElsewhere,
    withdrawnApplications: 0,
  },
});
