import type { Decision, DecisionVersion } from "@merit/decisions/domain";
import { fromMinorUnits } from "@merit/money";

import type { DecisionApplication, DecisionRound } from "../contracts/decisions";

export const decisionApplication: DecisionApplication = {
  title: "Community meals",
  intakeStatus: "ready",
  managerRecommendation: {
    position: "Fund with a condition",
    allocation: fromMinorUnits(2000000n),
    reasoning: "Confirm the venue before funding.",
  },
};

/** A €60,000 round holding this application's €24,000 award and €28,000 of others. */
export const decisionRound: DecisionRound = {
  budget: fromMinorUnits(6000000n),
  totals: {
    committed: fromMinorUnits(5200000n),
    available: fromMinorUnits(800000n),
    withdrawnApplications: 0,
  },
};

export const firstDecision: Decision = {
  outcome: "Fund",
  amount: fromMinorUnits(2400000n),
  conditions: "",
  reason: "Meets the round's priorities.",
  decidedBy: "Funding committee",
  decisionDate: "2026-01-18",
  recorder: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } },
  recordedAt: "2026-01-19T10:00:00.000Z",
  applicationVersion: 1,
};

export const amendedDecision: Decision = {
  ...firstDecision,
  outcome: "Fund with conditions",
  amount: fromMinorUnits(2000000n),
  conditions: "Confirm the venue in writing.",
  reason: "Reduced to match the recommendation.",
  changeExplanation: "The venue is not yet confirmed.",
  recorder: {
    userId: "dana",
    name: "Dana Reed",
    provenance: { interface: "mcp", clientId: "assistant" },
  },
  recordedAt: "2026-02-02T09:30:00.000Z",
};

/** Two saved versions, newest first. */
export const twoVersions: readonly DecisionVersion[] = [
  { revision: 2, decision: amendedDecision },
  { revision: 1, decision: firstDecision },
];

export const oneVersion: readonly DecisionVersion[] = [{ revision: 1, decision: firstDecision }];
