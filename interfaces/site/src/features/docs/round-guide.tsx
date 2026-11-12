import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const RoundGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="rounds"
      next="applications"
      sections={[
        {
          id: "create",
          title: t("docs.pages.rounds.create.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["first", "second", "third"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.rounds.create.steps.${key}`)}</li>
                ))}
              </ol>
              <p className={styles.note}>{t("docs.pages.rounds.create.access")}</p>
            </>
          ),
        },
        {
          id: "criteria-budget",
          title: t("docs.pages.rounds.criteriaBudget.title"),
          children: <p>{t("docs.pages.rounds.criteriaBudget.body")}</p>,
        },
        {
          id: "applications",
          title: t("docs.pages.rounds.intake.title"),
          children: (
            <>
              <p>{t("docs.pages.rounds.intake.body")}</p>
              <Link to="/docs/applications" className={styles.textLink}>
                {t("docs.pages.rounds.intake.action")}
              </Link>
            </>
          ),
        },
        {
          id: "revisions",
          title: t("docs.pages.rounds.revisions.title"),
          children: (
            <>
              <p>{t("docs.pages.rounds.revisions.body")}</p>
              <Link to="/docs/applications" hash="revisions" className={styles.textLink}>
                {t("docs.pages.rounds.revisions.action")}
              </Link>
            </>
          ),
        },
        {
          id: "saving",
          title: t("docs.pages.rounds.saving.title"),
          children: (
            <>
              <h3>{t("docs.pages.rounds.saving.detailsTitle")}</h3>
              <p>
                <Trans
                  t={t}
                  i18nKey="docs.pages.rounds.saving.details"
                  components={{ control: <strong /> }}
                />
              </p>
              <h3>{t("docs.pages.rounds.saving.writingTitle")}</h3>
              <p>
                <Trans
                  t={t}
                  i18nKey="docs.pages.rounds.saving.writing"
                  components={{ control: <strong /> }}
                />
              </p>
              <p className={styles.note}>{t("docs.pages.rounds.saving.access")}</p>
            </>
          ),
        },
      ]}
    />
  );
};
