import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { summarizeAssessments } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import judgment from "@merit/ui/judgment.module.css";
import { PersonIdentity } from "@merit/ui/person-identity";

import styles from "../review-overview.module.css";
import { reviewPositionKeys } from "./assessment-outcome";
import { reviewStatusText } from "./status-text";

export const ReviewOverview = ({
  application,
  onShowAll,
  onSelect,
  triggerRef,
  actions,
}: {
  actions?: ReactNode;
  application: Application;
  onShowAll: () => void;
  onSelect: (id: string) => void;
  triggerRef: (id: string, element: HTMLButtonElement | null) => void;
}) => {
  const { t } = useTranslation(["reviewGrant", "reviews"]);
  const { money } = useFormat();
  const status = reviewStatusText(t, summarizeAssessments(application.assessments));
  if (
    application.intakeStatus === "in_preparation" &&
    !application.assessments.length &&
    !application.reviews.requests.length
  ) {
    return null;
  }

  return (
    <section aria-label={t("assessments.shortTitle")}>
      <div className={styles.sectionHeading}>
        <h2>{t("assessments.shortTitle")}</h2>
        <Button variant="quiet" size="small" onPress={onShowAll}>
          {t("reviews:allAssessments")}
        </Button>
      </div>
      <p className={judgment.meta}>{status}</p>
      {actions}
      <div className={styles.reviewList}>
        {application.assessments.map((assessment) => {
          const reviewed = assessment.submission;

          return (
            <Button
              variant="quiet"
              key={assessment.id}
              className={styles.reviewChoice}
              ref={(element) => triggerRef(assessment.id, element)}
              onPress={() => onSelect(assessment.id)}
            >
              <span className={judgment.judgmentHeader}>
                <PersonIdentity name={assessment.reviewer} className={judgment.judgmentIdentity} />
                <Icon name="right" />
              </span>
              <span className={judgment.judgmentBody}>
                <span className={judgment.judgmentSummary}>
                  <strong>
                    {reviewed
                      ? reviewed.recommendation.position
                        ? t(reviewPositionKeys[reviewed.recommendation.position])
                        : t("workspace.noPosition")
                      : t("reviews:outstanding")}
                  </strong>
                  {reviewed?.recommendation.allocation && (
                    <span>
                      {t("reviews:proposed", { amount: money(reviewed.recommendation.allocation) })}
                    </span>
                  )}
                </span>
                <ReviewChoiceBasis application={application} assessment={assessment} />
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
};

const ReviewChoiceBasis = ({
  application,
  assessment,
}: {
  application: Application;
  assessment: Application["assessments"][number];
}) => {
  const { t } = useTranslation(["reviewGrant", "reviews"]);
  const request = application.reviews.requests.find((item) => item.id === assessment.id);
  const reviewed = assessment.submission;
  const version = reviewed?.applicationVersion ?? request?.applicationVersion;
  return (
    <span className={judgment.judgmentBasis}>
      <span>
        {version == null
          ? t("reviews:applicationBasisUnknown")
          : t(
              reviewed
                ? version !== application.version
                  ? "workspace.earlierBasis"
                  : "workspace.reviewedBasis"
                : "workspace.requestedBasis",
              { version },
            )}
      </span>
      {assessment.criteriaChanged && <span>{t("reviews:criteriaChanged")}</span>}
      {assessment.criteriaUnknown && <span>{t("reviews:criteriaBasisUnknown")}</span>}
    </span>
  );
};
