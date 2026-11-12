import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import localStyles from "./standalone-page.module.css";

export const StandalonePage = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation("common");
  const main = useRef<HTMLElement>(null);
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className={localStyles.page}>
      <header className={localStyles.header}>
        <Link to="/" aria-label={t("home")} className={localStyles.brand}>
          merit
        </Link>
      </header>
      <main id="main" ref={main} tabIndex={-1} className={localStyles.content}>
        {children}
      </main>
    </div>
  );
};
