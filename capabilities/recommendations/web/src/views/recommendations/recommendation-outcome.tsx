import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import type { Recommendation } from "@merit/recommendations/domain";
import { OutcomeSummary } from "@merit/ui/outcome-summary";

import { recommendationPositionKeys } from "./messages";

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

  const title =
    recommendation.position === null
      ? t("assessments.positionNotStated")
      : t(recommendationPositionKeys[recommendation.position], { context: "summary" });
  const detail =
    recommendation.allocation === null
      ? t("assessments.amountNotStated")
      : recommendation.position === "Defer" || recommendation.position === "Decline"
        ? t("applications.noAllocation")
        : t("applications.proposedAmount", { amount: money(recommendation.allocation) });

  return <OutcomeSummary title={title} detail={detail} />;
};
