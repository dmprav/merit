import type { Decision, DecisionOutcome } from "@merit/decisions/domain";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { fromMinorUnits, toDecimal } from "@merit/money";

import type { DecisionDraft } from "../../contracts/decisions";

const recommendedOutcome = (
  position: "Fund" | "Fund with a condition" | "Defer",
): DecisionOutcome => (position === "Fund with a condition" ? "Fund with conditions" : position);

/**
 * An existing decision is the starting point for a change. Without one, the manager's
 * recommendation supplies the position and amount; otherwise the form starts blank.
 */
export const decisionDraft = (
  decision: Decision | null,
  recommendation: Application["managerRecommendation"],
): DecisionDraft => {
  if (decision) {
    return {
      outcome: decision.outcome,
      amount: toDecimal(decision.amount),
      conditions: decision.conditions,
      reason: decision.reason,
      decidedBy: decision.decidedBy,
      decisionDate: decision.decisionDate,
      changeExplanation: "",
    };
  }
  const blank = {
    conditions: "",
    reason: "",
    decidedBy: "",
    decisionDate: "",
    changeExplanation: "",
  };
  if (!recommendation) {
    return { ...blank, outcome: "Fund", amount: "" };
  }
  return {
    ...blank,
    outcome: recommendedOutcome(recommendation.position),
    amount: toDecimal(
      recommendation.position === "Defer" ? fromMinorUnits(0n) : recommendation.allocation,
    ),
  };
};
