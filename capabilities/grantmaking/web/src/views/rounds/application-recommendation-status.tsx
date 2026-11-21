import { useTranslation } from "react-i18next";

import type { ApplicationOverview } from "@merit/grantmaking/api";
import { recommendationPositionKeys } from "@merit/recommendations-web/work";
import { StatusIndicator } from "@merit/ui/status-indicator";
import { Text } from "@merit/ui/text";

/** The recommendation's position and freshness, independent of its table layout. */
export const ApplicationRecommendationStatus = ({
  recommendation,
}: {
  recommendation: ApplicationOverview["recommendation"];
}) => {
  const { t } = useTranslation("fundingRounds");
  return (
    <>
      {recommendation ? (
        <span>{t(recommendationPositionKeys[recommendation.position])}</span>
      ) : (
        <Text variant="missing">{t("applications.notRecommended")}</Text>
      )}
      {recommendation?.outdated && (
        <StatusIndicator
          label={t("applications.recommendationWarning")}
          explanation={t("applications.earlierVersionExplanation")}
        />
      )}
    </>
  );
};
