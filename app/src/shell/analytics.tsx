import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { AnalyticsProvider, type AnalyticsClient } from "@merit/analytics";
import { createPostHogAnalytics } from "@merit/analytics/posthog";

import { readAnalyticsConfig } from "../analytics-config";

export const createShellAnalytics = (): AnalyticsClient =>
  createPostHogAnalytics(readAnalyticsConfig());

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
