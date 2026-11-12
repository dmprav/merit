import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const ApplicationGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="applications"
      next="recommendations"
      sections={[
        {
          id: "create",
          title: t("docs.pages.applications.create.title"),
          children: (
            <>
              <p>{t("docs.pages.applications.create.overview")}</p>
              <ol className={styles.steps}>
                {(["open", "enter", "save"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.applications.create.steps.${key}`)}</li>
                ))}
              </ol>
              <p className={styles.note}>{t("docs.pages.applications.create.access")}</p>
            </>
          ),
        },
        {
          id: "prepare",
          title: t("docs.pages.applications.prepare.title"),
          children: (
            <>
              <h3>{t("docs.pages.applications.prepare.detailsTitle")}</h3>
              <p>{t("docs.pages.applications.prepare.details")}</p>
              <h3>{t("docs.pages.applications.prepare.materialTitle")}</h3>
              <p>{t("docs.pages.applications.prepare.material")}</p>
              <h3>{t("docs.pages.applications.prepare.contactsTitle")}</h3>
              <p>{t("docs.pages.applications.prepare.contacts")}</p>
              <Link to="/docs/contacts" hash="details" className={styles.textLink}>
                {t("docs.pages.applications.prepare.contactsAction")}
              </Link>
            </>
          ),
        },
        {
          id: "ready",
          title: t("docs.pages.applications.ready.title"),
          children: (
            <>
              <p>{t("docs.pages.applications.ready.body")}</p>
              <p className={styles.note}>{t("docs.pages.applications.ready.consequence")}</p>
            </>
          ),
        },
        {
          id: "revisions",
          title: t("docs.pages.applications.revisions.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["start", "edit", "inspect", "record"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.applications.revisions.steps.${key}`)}</li>
                ))}
              </ol>
              <p className={styles.note} data-tone="warning">
                {t("docs.pages.applications.revisions.consequence")}
              </p>
              <p>{t("docs.pages.applications.revisions.history")}</p>
            </>
          ),
        },
        {
          id: "saving",
          title: t("docs.pages.applications.saving.title"),
          children: <SavingApplications />,
        },
        {
          id: "delete",
          title: t("docs.pages.applications.delete.title"),
          children: <p>{t("docs.pages.applications.delete.body")}</p>,
        },
      ]}
    />
  );
};

const SavingApplications = () => {
  const { t } = useTranslation("site");
  return (
    <>
      <h3>{t("docs.pages.applications.saving.savedTitle")}</h3>
      <p>
        <Trans
          t={t}
          i18nKey="docs.pages.applications.saving.saved"
          components={{ control: <strong /> }}
        />
      </p>
      <h3>{t("docs.pages.applications.saving.conflictTitle")}</h3>
      <p>
        <Trans
          t={t}
          i18nKey="docs.pages.applications.saving.conflict"
          components={{ control: <strong /> }}
        />
      </p>
      <h3>{t("docs.pages.applications.saving.refreshTitle")}</h3>
      <p>
        <Trans
          t={t}
          i18nKey="docs.pages.applications.saving.refresh"
          components={{ control: <strong /> }}
        />
      </p>
    </>
  );
};
