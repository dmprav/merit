import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import type { Recommendation } from "@merit/recommendations/domain";

import { recommendationPositionKeys } from "./messages";
import styles from "./recommendation.module.css";

export const RecommendationOutcome = ({
  recommendation,
}: {
  recommendation: {
    position: Recommendation["position"] | "Decline" | null;
    allocation: Recommendation["allocation"] | null;
  };
}) => {
  const { t } = useTranslation("fundingRecommendations");
  const { money } = useFormat();

  return (
    <div className={styles.outcome}>
      <p className={styles.outcomeTitle}>
        {recommendation.position === null
          ? t("assessments.positionNotStated")
          : t(recommendationPositionKeys[recommendation.position], { context: "summary" })}
      </p>
      <p className={styles.allocation}>
        {recommendation.allocation === null
          ? t("assessments.amountNotStated")
          : recommendation.position === "Defer" || recommendation.position === "Decline"
            ? t("applications.noAllocation")
            : t("applications.proposedAmount", { amount: money(recommendation.allocation) })}
      </p>
    </div>
  );
};
