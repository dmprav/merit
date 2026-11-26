import type { TFunction } from "i18next";

import type { DecisionUpdateError } from "@merit/decisions/api";
import type { DecisionOutcome } from "@merit/decisions/domain";
import { decodeMoney, type Money } from "@merit/money";

import type { DecisionFailure } from "../../contracts/decisions";

export const decisionOutcomeKeys = {
  Fund: "outcome.fund",
  "Fund with conditions": "outcome.fundWithConditions",
  Defer: "outcome.defer",
  Decline: "outcome.decline",
} as const satisfies Record<DecisionOutcome, string>;

export const recommendationPositionKeys = {
  Fund: "comparison.fund",
  "Fund with a condition": "comparison.fundWithCondition",
  Defer: "comparison.defer",
} as const;

type Translate = TFunction<"committeeDecisions">;

const decisionErrorKeys = {
  positive_amount: "validation.positiveAmount",
  unfunded_amount: "validation.unfundedAmount",
  conditions_required: "validation.conditionsRequired",
  conditions_not_allowed: "validation.conditionsNotAllowed",
  conditions_too_long: "validation.conditionsTooLong",
  reason_required: "validation.reasonRequired",
  reason_too_long: "validation.reasonTooLong",
  decided_by_required: "validation.decidedByRequired",
  decided_by_too_long: "validation.decidedByTooLong",
  decision_date_invalid: "validation.decisionDateInvalid",
  decision_date_in_future: "validation.decisionDateInFuture",
  change_explanation_required: "validation.changeExplanationRequired",
  change_explanation_too_long: "validation.changeExplanationTooLong",
  application_not_found: "validation.applicationNotFound",
  application_withdrawn: "validation.applicationWithdrawn",
  application_not_ready: "validation.applicationNotReady",
  budget_required: "validation.budgetRequired",
  commitment_exceeds_budget: "validation.commitmentExceedsBudget",
  committed_total_too_large: "validation.committedTotalTooLarge",
  invalid_decision: "validation.invalid",
} as const satisfies Record<
  DecisionUpdateError | "budget_required" | "commitment_exceeds_budget",
  string
>;

export const decisionError = (
  t: Translate,
  code: keyof typeof decisionErrorKeys,
  excess = "",
): string => t(decisionErrorKeys[code], { excess });

export const decisionSaveError = (
  t: Translate,
  failure: DecisionFailure | null,
  money: (value: Money) => string,
): string | null => {
  if (!failure) {
    return null;
  }
  switch (failure.status) {
    case "conflict":
      return t("editor.conflict");
    case "invalid":
      return decisionError(
        t,
        failure.error,
        failure.excess ? money(decodeMoney(failure.excess)) : "",
      );
    case "not_found":
      return t("editor.accessLost");
    case "signed_out":
      return t("editor.signedOut");
    case "unavailable":
      return t("editor.saveError");
  }
};
