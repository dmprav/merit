import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { createMessages, MessagesProvider, type LocaleSettings } from "@merit/i18n";

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
      <h1 className={localStyles.title}>{t("notFound")}</h1>
      <a href="/" className={localStyles.returnLink}>
        {t("back")}
      </a>
    </main>
  );
};

const PageError = () => {
  const { t } = useTranslation("app");

  return (
    <main className={localStyles.fallback}>
      <h1 className={localStyles.title}>{t("error.title")}</h1>
      <p>{t("error.description")}</p>
      <a href="/" className={localStyles.returnLink}>
        {t("back")}
      </a>
    </main>
  );
};

const Root = ({ children }: { children: ReactNode }) => {
  const { locale } = Route.useRouteContext();
  // Theme the document from the server render onward so portaled controls inherit the page palette.
  const productTheme = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) => match.routeId === "/_product" || match.routeId === "/_administration",
      ),
  });

  return (
    <html lang={locale.language} dir="ltr" data-product-theme={productTheme ? "" : undefined}>
      <head>
        <HeadContent />
      </head>
      <body>
        <MessagesProvider messages={appMessages} locale={locale}>
          <ShellAnalyticsProvider>
            <AccountProvider>{children}</AccountProvider>
          </ShellAnalyticsProvider>
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
