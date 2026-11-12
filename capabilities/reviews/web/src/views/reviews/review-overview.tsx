import { useTranslation } from "react-i18next";

import { type ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { recommendationPositionKeys } from "@merit/recommendations-web/work";
import { summarizeAssessments } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { PersonIdentity } from "@merit/ui/person-identity";

import styles from "../judgment.module.css";
import { reviewStatusText } from "./status-text";

export const ReviewOverview = ({
  application,
  onShowAll,
  onSelect,
  triggerRef,
}: {
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
          {t("workspace.allReviews")}
        </Button>
      </div>
      <p className={styles.meta}>{status}</p>
      <div className={styles.reviewList}>
        {application.assessments.map((assessment) => {
          const request = application.reviews.requests.find((item) => item.id === assessment.id);
          const reviewed = assessment.submission;
          const version = reviewed?.applicationVersion ?? request?.applicationVersion;

          return (
            <Button
              variant="quiet"
              key={assessment.id}
              className={styles.reviewChoice}
              ref={(element) => triggerRef(assessment.id, element)}
              onPress={() => onSelect(assessment.id)}
            >
              <span className={styles.judgmentHeader}>
                <PersonIdentity name={assessment.reviewer} className={styles.judgmentIdentity} />
                <Icon name="right" />
              </span>
              <span className={styles.judgmentBody}>
                <span className={styles.judgmentSummary}>
                  <strong>
                    {reviewed
                      ? reviewed.recommendation.position
                        ? t(recommendationPositionKeys[reviewed.recommendation.position])
                        : t("workspace.noPosition")
                      : t("reviews:outstanding")}
                  </strong>
                  {reviewed?.recommendation.allocation && (
                    <span>
                      {t("reviews:proposed", { amount: money(reviewed.recommendation.allocation) })}
                    </span>
                  )}
                  <span className={styles.judgmentBasis}>
                    {assessment.status === "outdated" && (
                      <span className={styles.attentionDot} aria-hidden="true" />
                    )}
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
                </span>
                {reviewed && <span className={styles.prose}>{reviewed.reasoning}</span>}
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
};
