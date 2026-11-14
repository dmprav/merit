import type { TFunction } from "i18next";

import type {
  Recommendation,
  RecommendationIssueCode,
  RecommendationUpdateError,
} from "@merit/recommendations/domain";

import type { RecommendationFailure } from "../../contracts/recommendations";

export const recommendationSaveError = (
  t: TFunction<"fundingRecommendations">,
  failure: RecommendationFailure | null,
): string | null => {
  if (!failure) {
    return null;
  }
  switch (failure.status) {
    case "conflict":
      return t("editor.conflict");
    case "invalid":
      return recommendationError(t, failure.error);
    case "not_found":
      return t("editor.accessLost");
    case "signed_out":
      return t("editor.signedOut");
    case "unavailable":
      return t("editor.saveError");
  }
};

export const recommendationError = (
  t: TFunction<"fundingRecommendations">,
  code: RecommendationIssueCode | RecommendationUpdateError,
): string => {
  switch (code) {
    case "reasoning_required":
      return t("validation.reasoningRequired");
    case "reasoning_too_long":
      return t("validation.reasoningTooLong");
    case "deferral_allocation":
      return t("validation.deferralAllocation");
    case "positive_allocation":
      return t("validation.positiveAllocation");
    case "application_not_ready":
      return t("intake.fundingNotReady");
    case "application_not_found":
      return t("validation.applicationNotFound");
    case "application_withdrawn":
      return t("validation.applicationWithdrawn");
    case "allocation_total_too_large":
      return t("validation.allocationTotalTooLarge");
    case "invalid_recommendation":
      return t("validation.invalid");
  }
};

export const recommendationPositionKeys = {
  Fund: "position.fund",
  "Fund with a condition": "position.fundWithCondition",
  Defer: "position.defer",
  Decline: "position.decline",
} as const satisfies Record<Recommendation["position"] | "Decline", string>;
