import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { defaultLocale } from "@merit/i18n";
import { createQueryClient } from "@merit/query";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient, locale: defaultLocale },
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // Restore collection positions through return links as well as browser Back.
    getScrollRestorationKey: (location) =>
      /\/(?:rounds\/[^/]+|applications)\/?$/.test(location.pathname)
        ? location.href
        : (location.state.__TSR_key ?? location.href),
    scrollToTopSelectors: ['#main [role="tabpanel"]'],
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
