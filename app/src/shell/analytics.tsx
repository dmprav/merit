import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { AnalyticsProvider, type AnalyticsClient } from "@merit/analytics";
import { createPostHogAnalytics } from "@merit/analytics/posthog";

const readEnvString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const createShellAnalytics = (): AnalyticsClient =>
  createPostHogAnalytics({
    apiKey: readEnvString(import.meta.env.VITE_POSTHOG_KEY),
    host: readEnvString(import.meta.env.VITE_POSTHOG_HOST),
  });

const PageViewTracker = ({ client }: { client: AnalyticsClient }) => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    client.pageView(pathname);
  }, [client, pathname]);

  return null;
};

export const ShellAnalyticsProvider = ({ children }: { children: ReactNode }) => {
  const [client] = useState(createShellAnalytics);

  return (
    <AnalyticsProvider client={client}>
      <PageViewTracker client={client} />
      {children}
    </AnalyticsProvider>
  );
};
