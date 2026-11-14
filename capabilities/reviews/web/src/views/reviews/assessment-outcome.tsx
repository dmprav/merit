import { useTranslation } from "react-i18next";

import { useFormat } from "@merit/i18n/format";
import type { Money } from "@merit/money";
import { OutcomeSummary } from "@merit/ui/outcome-summary";

export const reviewPositionKeys = {
  Fund: "position.fund",
  "Fund with a condition": "position.fundWithCondition",
  Defer: "position.defer",
  Decline: "position.decline",
} as const;

export const AssessmentOutcome = ({
  position,
  amount,
}: {
  position: keyof typeof reviewPositionKeys | null;
  amount: Money | null;
}) => {
  const { t } = useTranslation("reviewGrant");
  const { money } = useFormat();

  const title =
    position === null
      ? t("outcome.positionNotStated")
      : t(reviewPositionKeys[position], { context: "summary" });
  const detail =
    amount === null
      ? t("outcome.amountNotStated")
      : position === "Defer" || position === "Decline"
        ? t("outcome.noAllocation")
        : t("outcome.proposedAmount", { amount: money(amount) });

  return <OutcomeSummary title={title} detail={detail} />;
};
