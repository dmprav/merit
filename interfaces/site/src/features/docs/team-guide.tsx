import { useTranslation } from "react-i18next";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const TeamGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="team"
      next="workspaces"
      sections={[
        {
          id: "responsibilities",
          title: t("docs.pages.team.responsibilities.title"),
          children: (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t("docs.pages.team.responsibilities.responsibility")}</th>
                  <th scope="col">{t("docs.pages.team.responsibilities.access")}</th>
                </tr>
              </thead>
              <tbody>
                {(["owner", "admin", "manager"] as const).map((key) => (
                  <tr key={key}>
                    <th scope="row">{t(`docs.pages.team.responsibilities.${key}`)}</th>
                    <td>{t(`docs.pages.team.responsibilities.${key}Body`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        },
        {
          id: "invitations",
          title: t("docs.pages.team.invitations.title"),
          children: (
            <>
              <ol className={styles.steps}>
                {(["first", "second", "third"] as const).map((key) => (
                  <li key={key}>{t(`docs.pages.team.invitations.steps.${key}`)}</li>
                ))}
              </ol>
              <p>{t("docs.pages.team.invitations.acceptance")}</p>
            </>
          ),
        },
        {
          id: "delivery",
          title: t("docs.pages.team.delivery.title"),
          children: <p>{t("docs.pages.team.delivery.body")}</p>,
        },
        {
          id: "access",
          title: t("docs.pages.team.access.title"),
          children: <p>{t("docs.pages.team.access.body")}</p>,
        },
      ]}
    />
  );
};
