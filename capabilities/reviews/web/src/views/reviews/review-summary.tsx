import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { reviewProgress, type ReviewCounts } from "@merit/reviews/domain";
import { StatusIndicator, StatusIndicatorSpace } from "@merit/ui/status-indicator";
import { VisuallyHidden } from "@merit/ui/visually-hidden";

import styles from "./review-summary.module.css";
import { reviewStatusText } from "./status-text";

type ReviewSummaryProps = {
  reviews: ReviewCounts;
  criteriaChanged?: boolean;
  applicationTitle?: string;
  renderReviewLink?: (label: ReactNode) => ReactNode;
  /** Keep an indicator's width when there is none, to line up with other values in a column. */
  reserveIndicatorSpace?: boolean;
};

/** Completion is progress; freshness remains a separate qualification. */
export const ReviewSummary = ({
  reviews,
  criteriaChanged = false,
  applicationTitle,
  renderReviewLink,
  reserveIndicatorSpace = false,
}: ReviewSummaryProps) => {
  const { t } = useTranslation("reviewGrant");
  const status = reviewStatusText(t, reviews);
  const { submitted, assigned } = reviewProgress(reviews);
  const exceptional = reviews.outdated > 0 || reviews.unknown > 0 || criteriaChanged;
  const explanation = [status, criteriaChanged && t("collection.criteriaExplanation")]
    .filter(Boolean)
    .join(". ");
  const progress = (
    <span>
      {assigned
        ? t("collection.progress", { completed: submitted, total: assigned })
        : t("collection.none")}
      <VisuallyHidden>{`. ${status}`}</VisuallyHidden>
    </span>
  );

  return (
    <div className={styles.summary}>
      {renderReviewLink ? renderReviewLink(progress) : progress}
      {exceptional && (
        <StatusIndicator
          label={t("collection.inspect", { title: applicationTitle ?? t("collection.round") })}
          explanation={explanation}
          tone={reviews.outdated || criteriaChanged ? "warning" : "muted"}
        />
      )}
      {!exceptional && reserveIndicatorSpace && <StatusIndicatorSpace />}
    </div>
  );
};
