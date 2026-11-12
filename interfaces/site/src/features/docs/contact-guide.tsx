import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const ContactGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="contacts"
      next="recommendations"
      sections={[
        {
          id: "find",
          title: t("docs.pages.contacts.find.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["open", "add", "use"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.contacts.find.steps.${key}`)}</li>
                ))}
              </ol>
              <p className={styles.note}>{t("docs.pages.contacts.find.access")}</p>
              <p>{t("docs.pages.contacts.find.identity")}</p>
            </>
          ),
        },
        {
          id: "details",
          title: t("docs.pages.contacts.details.title"),
          children: (
            <>
              <p>{t("docs.pages.contacts.details.shared")}</p>
              <p>{t("docs.pages.contacts.details.assignment")}</p>
              <Link to="/docs/applications" hash="prepare" className={styles.textLink}>
                {t("docs.pages.contacts.details.applicationsAction")}
              </Link>
            </>
          ),
        },
        {
          id: "archive",
          title: t("docs.pages.contacts.archive.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["archive", "resolve", "restore"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.contacts.archive.steps.${key}`)}</li>
                ))}
              </ol>
              <p className={styles.note}>{t("docs.pages.contacts.archive.consequence")}</p>
            </>
          ),
        },
        {
          id: "history",
          title: t("docs.pages.contacts.history.title"),
          children: <p>{t("docs.pages.contacts.history.body")}</p>,
        },
        {
          id: "saving",
          title: t("docs.pages.contacts.saving.title"),
          children: (
            <>
              <p>{t("docs.pages.contacts.saving.draft")}</p>
              <p>{t("docs.pages.contacts.saving.conflict")}</p>
              <p>{t("docs.pages.contacts.saving.refresh")}</p>
            </>
          ),
        },
      ]}
    />
  );
};
