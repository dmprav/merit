import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import type { AiReviewEntry } from "@merit/reviews/domain";

import { reviewPositionKeys } from "../reviews/assessment-outcome";

/**
 * The funding position of an AI review, with the amount only when it proposes an allocation, as a
 * reviewer's choice in the review overview does. Defer and Decline carry no amount to show.
 */
export const AiReviewSummary = ({ review }: { review: AiReviewEntry }) => {
  const { t } = useTranslation(["reviewGrant", "reviews"]);
  const { money } = useFormat();
  const allocated = review.position !== "Defer" && review.position !== "Decline";
  return (
    <>
      <strong>{t(reviewPositionKeys[review.position])}</strong>
      {allocated && (
        <span>{t("reviews:proposed", { amount: money(decodeMoney(review.amount)) })}</span>
      )}
    </>
  );
};
