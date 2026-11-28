import { useTranslation } from "react-i18next";

import type { AiReviewEntry } from "@merit/reviews/domain";

import { ReviewBasisNotice, UnknownBasis } from "../reviews/review-basis-notice";

/** The short qualifications of what the AI review was based on, as separate spans. */
export const AiReviewBasis = ({ review }: { review: AiReviewEntry }) => {
  const { t } = useTranslation(["aiReview", "reviewGrant", "reviews"]);
  const { basisComparison: basis } = review;
  if (review.freshness === "current") {
    return (
      <span>
        {t("reviewGrant:workspace.reviewedBasis", { version: review.applicationVersion })}
      </span>
    );
  }
  return (
    <>
      {basis.applicationVersion === "different" && (
        <span>{t("reviewGrant:workspace.earlierBasis")}</span>
      )}
      {basis.criteriaContent === "different" && <span>{t("aiReview:criteriaChanged")}</span>}
      <UnknownBasis basis={basis} />
    </>
  );
};

/** Says when an AI review no longer matches the application or criteria, and offers the comparison. */
export const AiReviewBasisNotice = ({
  review,
  onInspectVersion,
}: {
  review: AiReviewEntry;
  onInspectVersion?: (version: number) => void;
}) => {
  const { t } = useTranslation("aiReview");
  return (
    <ReviewBasisNotice
      basis={review.basisComparison}
      criteriaChanged={t("criteriaChanged")}
      onCompare={onInspectVersion && (() => onInspectVersion(review.applicationVersion))}
    />
  );
};
