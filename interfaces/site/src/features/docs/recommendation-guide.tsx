import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

import { RecommendationExample } from "@merit/grantmaking-web/examples/recommendation";

import { DemoLink, DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const RecommendationGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="recommendations"
      next="rounds"
      sections={[
        {
          id: "application",
          title: t("docs.pages.recommendations.application.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["round", "application", "evidence"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.recommendations.application.steps.${key}`)}</li>
                ))}
              </ol>
              <p>{t("docs.pages.recommendations.application.evidence")}</p>
              <DemoLink />
            </>
          ),
        },
        {
          id: "reviews",
          title: t("docs.pages.recommendations.reviews.title"),
          children: <ReadingReviewStatus />,
        },
        {
          id: "manage-reviews",
          title: t("docs.pages.recommendations.manageReviews.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["request", "arrange", "record", "followUp"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.recommendations.manageReviews.steps.${key}`)}</li>
                ))}
              </ol>
              <p className={styles.note}>{t("docs.pages.recommendations.manageReviews.scope")}</p>
              <p>
                <Link to="/docs/reviews">{t("docs.pages.recommendations.reviewerGuide")}</Link>
              </p>
            </>
          ),
        },
        {
          id: "recommendation",
          title: t("docs.pages.recommendations.recommendation.title"),
          children: <ChoosingRecommendation />,
        },
        {
          id: "budget",
          title: t("docs.pages.recommendations.budget.title"),
          children: <CheckingBudget />,
        },
        {
          id: "saving",
          title: t("docs.pages.recommendations.saving.title"),
          children: (
            <>
              <h3>{t("docs.pages.recommendations.saving.saveTitle")}</h3>
              <p>
                <Trans
                  t={t}
                  i18nKey="docs.pages.recommendations.saving.instructions"
                  components={{ control: <strong /> }}
                />
              </p>
              <h3>{t("docs.pages.recommendations.saving.resumeTitle")}</h3>
              <p>
                <Trans
                  t={t}
                  i18nKey="docs.pages.recommendations.saving.resume"
                  components={{ control: <strong /> }}
                />
              </p>
              <h3>{t("docs.pages.recommendations.saving.storageTitle")}</h3>
              <p>{t("docs.pages.recommendations.saving.storage")}</p>
              <div className={styles.example}>
                <h3>{t("docs.pages.recommendations.saving.recoveryTitle")}</h3>
                <p>{t("docs.pages.recommendations.saving.recovery")}</p>
              </div>
              <DemoLink />
            </>
          ),
        },
      ]}
    >
      <p className={styles.note}>{t("docs.shared.commitment")}</p>
    </DocsArticle>
  );
};

const ReadingReviewStatus = () => {
  const { t } = useTranslation("site");
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("docs.pages.recommendations.reviews.status.label")}</th>
            <th scope="col">{t("docs.pages.recommendations.reviews.status.meaning")}</th>
          </tr>
        </thead>
        <tbody>
          {(["current", "outdated", "unknown", "awaiting"] as const).map((key) => (
            <tr key={key}>
              <th scope="row">{t(`docs.pages.recommendations.reviews.status.${key}`)}</th>
              <td>{t(`docs.pages.recommendations.reviews.status.${key}Body`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.example}>
        <h3>{t("docs.pages.recommendations.reviews.exampleTitle")}</h3>
        <p>{t("docs.pages.recommendations.reviews.example")}</p>
      </div>
      <p>{t("docs.pages.recommendations.reviews.consequence")}</p>
    </>
  );
};

const ChoosingRecommendation = () => {
  const { t } = useTranslation("site");
  return (
    <>
      <ol className={styles.steps}>
        {(["edit", "position", "reason"] as const).map((key) => (
          <li key={key}>{t(`docs.pages.recommendations.recommendation.steps.${key}`)}</li>
        ))}
      </ol>
      <table className={styles.table}>
        <thead>
          <tr>
            {(["position", "amount", "effect"] as const).map((key) => (
              <th key={key} scope="col">
                {t(`docs.pages.recommendations.recommendation.positions.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["fund", "conditional", "defer"] as const).map((key) => (
            <tr key={key}>
              <th scope="row">{t(`docs.pages.recommendations.recommendation.positions.${key}`)}</th>
              <td>
                {t(
                  `docs.pages.recommendations.recommendation.positions.${key === "defer" ? "zero" : "positive"}`,
                )}
              </td>
              <td>
                {t(
                  `docs.pages.recommendations.recommendation.positions.${key === "defer" ? "none" : "full"}`,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t("docs.pages.recommendations.recommendation.positions.missing")}</p>
      <p>{t("docs.pages.recommendations.recommendation.reference")}</p>
    </>
  );
};

const CheckingBudget = () => {
  const { t } = useTranslation("site");
  return (
    <>
      <p>{t("docs.pages.recommendations.budget.calculation")}</p>
      <p>{t("docs.pages.recommendations.budget.preview")}</p>
      <div className={styles.example}>
        <h3>{t("docs.pages.recommendations.budget.exampleTitle")}</h3>
        <table className={styles.table}>
          <tbody>
            <tr>
              <th scope="row">{t("docs.pages.recommendations.budget.rows.first")}</th>
              <td className={styles.amount}>€24,000</td>
            </tr>
            <tr>
              <th scope="row">{t("docs.pages.recommendations.budget.rows.second")}</th>
              <td className={styles.amount}>€28,000</td>
            </tr>
            <tr>
              <th scope="row">{t("docs.pages.recommendations.budget.rows.remaining")}</th>
              <td className={styles.amount}>€8,000</td>
            </tr>
          </tbody>
        </table>
        <p>{t("docs.pages.recommendations.budget.example")}</p>
      </div>
      <p className={styles.note} data-tone="warning">
        {t("docs.pages.recommendations.budget.limits")}
      </p>
      <h3>{t("docs.pages.recommendations.budget.tryTitle")}</h3>
      <p>{t("docs.pages.recommendations.budget.tryInstructions")}</p>
      <p className={styles.note}>{t("docs.pages.recommendations.budget.tryScope")}</p>
      <div
        className={styles.interactiveExample}
        role="group"
        aria-label={t("docs.pages.recommendations.budget.tryTitle")}
      >
        <RecommendationExample />
      </div>
    </>
  );
};
