import { useTranslation } from "react-i18next";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const WorkspaceGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="workspaces"
      next="recommendations"
      sections={[
        {
          id: "joining",
          title: t("docs.pages.workspaces.joining.title"),
          children: (
            <ol className={styles.steps}>
              {(["first", "second", "third"] as const).map((key) => (
                <li key={key}>{t(`docs.pages.workspaces.joining.steps.${key}`)}</li>
              ))}
            </ol>
          ),
        },
        {
          id: "switching",
          title: t("docs.pages.workspaces.switching.title"),
          children: <p>{t("docs.pages.workspaces.switching.body")}</p>,
        },
        {
          id: "navigation",
          title: t("docs.pages.workspaces.navigation.title"),
          children: (
            <>
              <p>{t("docs.pages.workspaces.navigation.body")}</p>
              <p>{t("docs.pages.workspaces.navigation.pins")}</p>
              <p>{t("docs.pages.workspaces.navigation.settings")}</p>
            </>
          ),
        },
        {
          id: "access",
          title: t("docs.pages.workspaces.access.title"),
          children: <p>{t("docs.pages.workspaces.access.body")}</p>,
        },
      ]}
    />
  );
};
