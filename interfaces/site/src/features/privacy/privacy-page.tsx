import { useTranslation } from "react-i18next";

import styles from "./privacy-page.module.css";

export const PrivacyPage = () => {
  const { t } = useTranslation("site");

  return (
    <article className={styles.article}>
      <header>
        <h1>{t("privacy.title")}</h1>
        <p>{t("privacy.introduction")}</p>
      </header>
      {(["contact", "collection", "purpose", "access", "retention", "choices"] as const).map(
        (section) => (
          <section key={section}>
            <h2>{t(`privacy.${section}.title`)}</h2>
            <p>{t(`privacy.${section}.body`)}</p>
            {section === "purpose" && <p>{t("privacy.purpose.optional")}</p>}
          </section>
        ),
      )}
    </article>
  );
};
