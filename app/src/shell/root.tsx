import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { createMessages, MessagesProvider, type LocaleSettings } from "@merit/i18n";
import { reportError } from "@merit/telemetry/errors";
import { Link } from "@merit/ui/link";
import { StateMessage } from "@merit/ui/state-message";
import { Toasts } from "@merit/ui/toast";

import { AccountProvider } from "./account-provider";
import { ShellAnalyticsProvider } from "./analytics";
import { appMessages } from "./messages";
import localStyles from "./root.module.css";
import stylesheet from "./style.css?url";

const DevelopmentTools = import.meta.env.DEV
  ? lazy(() => import("../development/development-tools"))
  : null;

const NotFound = () => {
  const { t } = useTranslation("app");

  return (
    <main className={localStyles.fallback}>
      <StateMessage
        title={t("notFound")}
        actions={
          <Link href="/" variant="standalone">
            {t("back")}
          </Link>
        }
      />
    </main>
  );
};

const PageError = ({ error }: ErrorComponentProps) => {
  const { t } = useTranslation("app");

  useEffect(() => {
    reportError(error, { surface: "web", operation: "root.errorBoundary" });
  }, [error]);

  return (
    <main className={localStyles.fallback}>
      <StateMessage
        title={t("error.title")}
        description={t("error.description")}
        actions={
          <Link href="/" variant="standalone">
            {t("back")}
          </Link>
        }
      />
    </main>
  );
};

const Root = ({ children }: { children: ReactNode }) => {
  const { locale } = Route.useRouteContext();
  // Decided from the server render onward: portaled controls inherit the application palette,
  // and only application pages carry account state, leaving public site pages identical for all.
  const inApplication = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) => match.routeId === "/_product" || match.routeId === "/_administration",
      ),
  });

  return (
    <html lang={locale.language} dir="ltr" data-product-theme={inApplication ? "" : undefined}>
      <head>
        <HeadContent />
      </head>
      <body>
        <MessagesProvider messages={appMessages} locale={locale}>
          <ShellAnalyticsProvider>
            <AccountProvider enabled={inApplication}>{children}</AccountProvider>
          </ShellAnalyticsProvider>
          <Toasts />
          {DevelopmentTools && (
            <ClientOnly>
              <Suspense>
                <DevelopmentTools />
              </Suspense>
            </ClientOnly>
          )}
        </MessagesProvider>
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  locale: LocaleSettings;
}>()({
  head: ({ match: { context } }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Merit" },
      {
        name: "description",
        content: createMessages(appMessages, context.locale).t("app:description"),
      },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: Root,
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: PageError,
});
