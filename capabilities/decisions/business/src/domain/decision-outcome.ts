import { z } from "zod";

import { isNegative, isZero, moneySchema, type Money } from "@merit/money";

export const decisionOutcomes = ["Fund", "Fund with conditions", "Defer", "Decline"] as const;

export type DecisionOutcome = (typeof decisionOutcomes)[number];

/** Fund and Fund with conditions authorize a commitment; Defer and Decline reserve nothing. */
export const commitsFunding = (outcome: DecisionOutcome) =>
  outcome === "Fund" || outcome === "Fund with conditions";

export const decisionLimits = {
  reasonLength: 5000,
  conditionsLength: 5000,
  decidedByLength: 200,
  changeExplanationLength: 2000,
} as const;

/** The outcome and what it commits: the amount follows the outcome. */
export const decisionOutcomeSchema = z
  .strictObject({
    outcome: z.enum(decisionOutcomes),
    amount: moneySchema.refine((value) => !isNegative(value), "Amount must be nonnegative"),
    conditions: z.string().trim().max(decisionLimits.conditionsLength),
  })
  .superRefine((value, context) => {
    const funded = commitsFunding(value.outcome);
    if (funded && isZero(value.amount)) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        params: { reason: "positive_amount" },
      });
    }
    if (!funded && !isZero(value.amount)) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        params: { reason: "unfunded_amount" },
      });
    }
    if (value.outcome === "Fund with conditions" && value.conditions === "") {
      context.addIssue({
        code: "custom",
        path: ["conditions"],
        params: { reason: "conditions_required" },
      });
    }
    if (value.outcome !== "Fund with conditions" && value.conditions !== "") {
      context.addIssue({
        code: "custom",
        path: ["conditions"],
        params: { reason: "conditions_not_allowed" },
      });
    }
  });

export type DecisionOutcomeFacts = { outcome: DecisionOutcome; amount: Money };
