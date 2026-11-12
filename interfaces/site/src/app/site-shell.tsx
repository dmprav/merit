import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { MessagesProvider } from "@merit/i18n";
import { Brand } from "@merit/ui/brand";

import { siteMessages } from "./messages";
import localStyles from "./site-shell.module.css";

export const SiteShell = ({
  children,
  variant = "site",
}: {
  children: ReactNode;
  variant?: "site" | "docs";
}) => {
  return (
    <MessagesProvider messages={siteMessages}>
      <Shell variant={variant}>{children}</Shell>
    </MessagesProvider>
  );
};

const Shell = ({ children, variant }: { children: ReactNode; variant: "site" | "docs" }) => {
  const { t } = useTranslation(["site", "common"]);

  return (
    <div className={`${localStyles.shell} ${variant === "docs" ? localStyles.docsShell : ""}`}>
      <a href="#main" className={localStyles.skip}>
        {t("common:skipToContent")}
      </a>
      <header className={localStyles.header}>
        <div className={localStyles.headerContent}>
          <div className={localStyles.identity}>
            <Link to="/" aria-label={t("common:home")} className={localStyles.brand}>
              <Brand />
            </Link>
            {variant === "docs" && (
              <Link to="/docs" className={localStyles.docsLabel}>
                {t("docs.label")}
              </Link>
            )}
          </div>
          <nav aria-label={t("common:mainNavigation")} className={localStyles.navigation}>
            {variant !== "docs" && (
              <Link to="/docs" className={localStyles.navigationLink}>
                {t("navigation.docs")}
              </Link>
            )}
            <Link to="/app/sign-in" className={localStyles.navigationLink}>
              {t("navigation.login")}
            </Link>
            <Link to="/demo" className={`${localStyles.navigationLink} ${localStyles.demoLink}`}>
              {t("navigation.demo")}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={localStyles.main}>
        {children}
      </main>
      <footer className={localStyles.footer}>
        <Link to="/" aria-label={t("common:home")} className={localStyles.footerBrand}>
          <Brand />
        </Link>
        <div className={localStyles.navigation}>
          <Link to="/privacy" className={localStyles.navigationLink}>
            {t("navigation.privacy")}
          </Link>
          <Link to="/docs" className={localStyles.navigationLink}>
            {t("navigation.docs")}
          </Link>
          <Link to="/app/sign-in" className={localStyles.navigationLink}>
            {t("navigation.login")}
          </Link>
        </div>
      </footer>
    </div>
  );
};
