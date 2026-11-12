import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DocsArticle } from "./docs-layout";
import styles from "./docs.module.css";

export const ReviewerGuide = () => {
  const { t } = useTranslation("site");

  return (
    <DocsArticle
      page="reviews"
      next="recommendations"
      sections={[
        {
          id: "invitation",
          title: t("docs.pages.reviews.invitation.title"),
          children: (
            <>
              <ol className={styles.steps}>
                <li>{t("docs.pages.reviews.invitation.steps.open")}</li>
                <li>{t("docs.pages.reviews.invitation.steps.respond")}</li>
              </ol>
              <p className={styles.note}>{t("docs.pages.reviews.invitation.access")}</p>
              <p>
                <Link to="/docs/mcp" hash="first-request">
                  {t("docs.pages.reviews.mcpGuide")}
                </Link>
              </p>
            </>
          ),
        },
        {
          id: "drafting",
          title: t("docs.pages.reviews.drafting.title"),
          children: (
            <>
              <p>{t("docs.pages.reviews.drafting.material")}</p>
              <p>{t("docs.pages.reviews.drafting.saving")}</p>
            </>
          ),
        },
        {
          id: "submitting",
          title: t("docs.pages.reviews.submitting.title"),
          children: (
            <>
              <ol className={styles.steps}>
                <li>{t("docs.pages.reviews.submitting.steps.position")}</li>
                <li>{t("docs.pages.reviews.submitting.steps.submit")}</li>
              </ol>
              <p>{t("docs.pages.reviews.submitting.confirmation")}</p>
            </>
          ),
        },
        {
          id: "amendments",
          title: t("docs.pages.reviews.amendments.title"),
          children: <p>{t("docs.pages.reviews.amendments.body")}</p>,
        },
        {
          id: "access",
          title: t("docs.pages.reviews.access.title"),
          children: (
            <>
              <p>{t("docs.pages.reviews.access.conflict")}</p>
              <p>{t("docs.pages.reviews.access.recovery")}</p>
              <p>
                <Link to="/docs/recommendations" hash="manage-reviews">
                  {t("docs.pages.reviews.managerGuide")}
                </Link>
              </p>
            </>
          ),
        },
      ]}
    />
  );
};
