import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { formatMoney } from "@merit/money";

import type { LandingPreview } from "./landing-preview";
import { positionKeys } from "./recommendation-labels";
import styles from "./round-preview.module.css";

export const RoundPreview = ({
  round,
  className,
}: {
  round: LandingPreview["round"];
  className?: string;
}) => {
  const { t } = useTranslation("site");
  const { formatLocale } = useLocaleSettings();

  return (
    <section
      className={`${styles.productPreview} ${className ?? ""}`}
      aria-labelledby="round-title"
    >
      <div className={styles.productContext}>
        <span>{round.foundation}</span>
        <span>{t("preview.rounds")}</span>
      </div>
      <div className={styles.productContent}>
        <header className={styles.roundHeading}>
          <div>
            <h2 id="round-title">{round.title}</h2>
            <p className={styles.meta}>{round.decisionStatus}</p>
          </div>
          <p className={styles.roundBudget}>
            <span>{t("preview.budget")}</span> {formatMoney(round.budget, formatLocale)}
          </p>
        </header>
        <dl className={styles.totals}>
          {(
            [
              { label: "requested", amount: round.totals.requested },
              { label: "proposed", amount: round.totals.proposed },
              { label: "remaining", amount: round.totals.remaining },
            ] as const
          ).map(({ label, amount }) => (
            <div key={label} className={label === "proposed" ? styles.proposedTotal : undefined}>
              <dt>{t(`preview.${label}`)}</dt>
              <dd>{formatMoney(amount, formatLocale)}</dd>
            </div>
          ))}
        </dl>
        <table className={styles.applications} aria-label={t("preview.applications")}>
          <thead>
            <tr>
              <th scope="col">{t("preview.application")}</th>
              <th scope="col">{t("preview.reviewStatus")}</th>
              <th scope="col">{t("preview.recommendation")}</th>
              <th scope="col">{t("preview.proposed")}</th>
            </tr>
          </thead>
          <tbody>
            {round.applications.map((application) => (
              <tr
                key={application.id}
                className={
                  application.reviews.outdated > 0 || application.reviews.outstanding > 0
                    ? styles.attentionRow
                    : undefined
                }
              >
                <th scope="row">{application.title}</th>
                <td className={styles.reviewCell}>
                  <ReviewStatus counts={application.reviews} />
                </td>
                <td className={styles.recommendationCell}>
                  <span className={styles.tableLabel} aria-hidden="true">
                    {t("preview.recommendation")}:
                  </span>
                  <span>{t(positionKeys[application.recommendation.position])}</span>
                </td>
                <td className={styles.amountCell}>
                  <span>{formatMoney(application.recommendation.allocation, formatLocale)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ReviewStatus = ({
  counts,
}: {
  counts: LandingPreview["round"]["applications"][number]["reviews"];
}) => {
  const { t } = useTranslation("site");
  const status = (["current", "outdated", "outstanding", "unknown"] as const)
    .map((key) => {
      const count = counts[key];
      return count > 0 ? t(`preview.review.${key}`, { count }) : null;
    })
    .filter(Boolean)
    .join(", ");
  return <span className={styles.reviewStatus}>{status}</span>;
};
