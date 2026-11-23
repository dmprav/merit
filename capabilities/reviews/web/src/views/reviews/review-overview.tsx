import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { summarizeAssessments } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { JudgmentChoice } from "@merit/ui/judgment";
import { PanelSection } from "@merit/ui/panel-section";

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
    <PanelSection
      title={t("assessments.shortTitle")}
      meta={status || undefined}
      actions={
        <>
          {actions}
          <Button variant="quiet" onPress={onShowAll}>
            {t("reviews:allAssessments")}
          </Button>
        </>
      }
    >
      <div className={styles.reviewList}>
        {application.assessments.map((assessment) => {
          const reviewed = assessment.submission;

          return (
            <JudgmentChoice
              key={assessment.id}
              ref={(element) => triggerRef(assessment.id, element)}
              onPress={() => onSelect(assessment.id)}
              author={assessment.reviewer}
              summary={
                <>
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
                </>
              }
              basis={<ReviewChoiceBasis application={application} assessment={assessment} />}
            />
          );
        })}
      </div>
    </PanelSection>
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
    <>
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
    </>
  );
};
