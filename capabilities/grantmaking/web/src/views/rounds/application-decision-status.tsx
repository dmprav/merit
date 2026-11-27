import { useTranslation } from "react-i18next";

import { decisionOutcomeKeys } from "@merit/decisions-web/decisions";
import type { ApplicationOverview } from "@merit/grantmaking/api";
import { Text } from "@merit/ui/text";

/** The committee's decision outcome, kept apart from the manager's recommendation status. */
export const ApplicationDecisionStatus = ({
  decision,
}: {
  decision: ApplicationOverview["decision"];
}) => {
  const { t } = useTranslation(["fundingRounds", "committeeDecisions"]);
  return decision ? (
    <span>{t(decisionOutcomeKeys[decision.outcome], { ns: "committeeDecisions" })}</span>
  ) : (
    <Text variant="missing">{t("applications.noDecision")}</Text>
  );
};
