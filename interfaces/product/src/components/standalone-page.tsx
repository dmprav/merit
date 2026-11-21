import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ApplicationStandalonePage } from "@merit/ui/application-shell";
import { Brand } from "@merit/ui/brand";

export const StandalonePage = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation("common");
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <ApplicationStandalonePage
      locationKey={pathname}
      brand={
        <Link to="/" aria-label={t("home")}>
          <Brand />
        </Link>
      }
    >
      {children}
    </ApplicationStandalonePage>
  );
};
