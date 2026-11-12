import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import type { Recommendation } from "@merit/recommendations/domain";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { PersonIdentity } from "@merit/ui/person-identity";

import { RecommendationOutcome } from "./recommendation-outcome";
import styles from "./recommendation.module.css";

export const RecommendationSummary = ({
  recommendation,
  manager,
}: {
  recommendation: Recommendation;
  manager: string;
}) => {
  const { t } = useTranslation("fundingRecommendations");
  const { calendarDate } = useFormat();

  return (
    <>
      <div className={styles.attribution}>
        <PersonIdentity name={recommendation.author?.name ?? manager} />
        {recommendation.author?.provenance && (
          <ActionProvenance value={recommendation.author.provenance} />
        )}
        {recommendation.recorded && (
          <span className={styles.attributionDetail}>
            {t("assessments.version", {
              date: calendarDate(recommendation.recorded.date),
              version: recommendation.recorded.applicationVersion,
            })}
          </span>
        )}
      </div>
      <RecommendationOutcome recommendation={recommendation} />
      <p className={styles.recommendationReason}>{recommendation.reasoning}</p>
    </>
  );
};
