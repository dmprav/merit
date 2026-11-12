import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Icon } from "@merit/ui/icon";
import linkStyles from "@merit/ui/link.module.css";

import localStyles from "./docs-home.module.css";
import { docsGroups, docsPages, type DocsPage } from "./docs-navigation";
import styles from "./docs.module.css";

export const DocsHome = () => {
  const { t } = useTranslation("site");

  return (
    <article className={`${styles.article} ${localStyles.home}`}>
      <header>
        <h1 className={styles.title}>{t("docs.pages.overview.title")}</h1>
        <p className={styles.introduction}>{t("docs.pages.overview.description")}</p>
      </header>
      <section className={localStyles.start}>
        <h2>{t("docs.pages.overview.start.title")}</h2>
        <p>{t("docs.pages.overview.start.description")}</p>
        <Link
          to="/docs/quickstart"
          className={linkStyles.button}
          data-variant="primary"
          data-size="large"
        >
          {t("docs.pages.overview.start.action")}
          <Icon name="forward" />
        </Link>
      </section>
      <div className={localStyles.directory}>
        {docsGroups

          .map((group) => (
            <section key={group}>
              <h2>{t(`docs.groups.${group}`)}</h2>
              {Object.entries(docsPages)
                .filter(([id, entry]) => id !== "overview" && entry.group === group)
                .map(([id, entry]) => (
                  <Link key={id} to={entry.to} className={localStyles.directoryLink}>
                    <strong>
                      {t(`docs.pages.${id as DocsPage}.title`)}
                      <Icon name="forward" />
                    </strong>
                    <p>{t(`docs.pages.${id as DocsPage}.description`)}</p>
                  </Link>
                ))}
            </section>
          ))}
      </div>
    </article>
  );
};
