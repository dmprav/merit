import { useTranslation } from "react-i18next";

import { DemoLink, DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const QuickstartGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="quickstart"
      next="recommendations"
      sections={[
        {
          id: "open",
          title: t("docs.pages.quickstart.open.title"),
          children: (
            <>
              <p>{t("docs.pages.quickstart.open.body")}</p>
              <DemoLink />
            </>
          ),
        },
        {
          id: "evidence",
          title: t("docs.pages.quickstart.evidence.title"),
          children: <p>{t("docs.pages.quickstart.evidence.body")}</p>,
        },
        {
          id: "review",
          title: t("docs.pages.quickstart.review.title"),
          children: <p>{t("docs.pages.quickstart.review.body")}</p>,
        },
        {
          id: "recommend",
          title: t("docs.pages.quickstart.recommend.title"),
          children: (
            <>
              <p>{t("docs.pages.quickstart.recommend.body")}</p>
              <p className={styles.note}>{t("docs.shared.commitment")}</p>
            </>
          ),
        },
        {
          id: "return",
          title: t("docs.pages.quickstart.return.title"),
          children: (
            <>
              <p>{t("docs.pages.quickstart.return.body")}</p>
              <p>{t("docs.pages.quickstart.return.limitations")}</p>
            </>
          ),
        },
      ]}
    />
  );
};
