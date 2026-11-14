import type { TFunction } from "i18next";

import type { ReviewSaveError } from "@merit/reviews/api";

import type { ReviewProblem } from "../../contracts/reviews";

export const reviewError = (
  t: TFunction<"reviews">,
  problem: ReviewProblem | null,
): string | null => {
  if (!problem) {
    return null;
  }
  switch (problem.status) {
    case "conflict":
      return t("conflict");
    case "request_conflict":
      return t("requestConflict");
    case "invalid": {
      const errors = {
        contact_unavailable: "contactUnavailable",
        already_requested: "alreadyRequested",
        request_unavailable: "requestUnavailable",
        assessment_unavailable: "assessmentUnavailable",
        follow_up_required: "followUpRequired",
        version_unavailable: "versionUnavailable",
        criteria_unavailable: "versionUnavailable",
        invalid_review: "invalidReview",
        reviewer_authored: "reviewerAuthored",
        application_withdrawn: "applicationWithdrawn",
      } as const satisfies Record<ReviewSaveError, string>;
      return t(errors[problem.error]);
    }
    case "not_found":
    case "signed_out":
      return t("accessLost");
    case "unavailable":
      return t("error");
  }
};
