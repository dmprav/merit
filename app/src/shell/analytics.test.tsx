import { act, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { sanitizeAnalyticsPath, useAnalytics } from "@merit/analytics";
import { createPostHogAnalytics } from "@merit/analytics/posthog";

import type { FileRouteTypes } from "../routeTree.gen";
import { createShellAnalytics, ShellAnalyticsProvider } from "./analytics";

const routerStore = vi.hoisted(() => {
  let pathname = "/demo";
  const listeners = new Set<() => void>();
  return {
    getPathname: () => pathname,
    setPathname: (next: string) => {
      pathname = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string;
  }) => {
    const pathname = useSyncExternalStore(routerStore.subscribe, routerStore.getPathname);
    return select({ location: { pathname } });
  },
}));
vi.mock("@merit/analytics/posthog", () => ({
  createPostHogAnalytics: vi.fn(),
}));

const Probe = () => {
  const analytics = useAnalytics();
  return (
    <button type="button" onClick={() => analytics.track("demo_reset")}>
      Track
    </button>
  );
};

beforeEach(() => {
  routerStore.setPathname("/demo");
  vi.mocked(createPostHogAnalytics).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it("wires Vite PostHog environment variables into the shell client", () => {
  const client = { pageView: vi.fn(), track: vi.fn(), reset: vi.fn() };
  vi.mocked(createPostHogAnalytics).mockReturnValue(client);
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_shell_key");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");

  expect(createShellAnalytics()).toBe(client);
  expect(createPostHogAnalytics).toHaveBeenCalledWith({
    apiKey: "phc_shell_key",
    host: "https://eu.i.posthog.com",
  });
});

it("records pageviews on navigation and exposes the analytics client to children", () => {
  const client = { pageView: vi.fn(), track: vi.fn(), reset: vi.fn() };
  vi.mocked(createPostHogAnalytics).mockReturnValue(client);

  render(
    <ShellAnalyticsProvider>
      <Probe />
    </ShellAnalyticsProvider>,
  );

  expect(client.pageView).toHaveBeenCalledExactlyOnceWith("/demo");

  act(() => {
    routerStore.setPathname("/demo/workshop-saturdays");
  });

  expect(client.pageView).toHaveBeenNthCalledWith(2, "/demo/workshop-saturdays");

  screen.getByRole("button", { name: "Track" }).click();
  expect(client.track).toHaveBeenCalledExactlyOnceWith("demo_reset");
});

// Typed against the route tree, so a new page fails typechecking until its analytics pattern is chosen.
const analyticsRouteByPage = {
  "/api/assistant/$workspaceSlug": "/*other",
  "/": "/",
  "/privacy": "/privacy",
  "/demo": "/demo",
  "/demo/workshop-saturdays": "/demo/workshop-saturdays",
  "/docs/": "/docs",
  "/docs/applications": "/docs/applications",
  "/docs/contacts": "/docs/contacts",
  "/docs/mcp": "/docs/mcp",
  "/docs/quickstart": "/docs/quickstart",
  "/docs/recommendations": "/docs/recommendations",
  "/docs/reviews": "/docs/reviews",
  "/docs/rounds": "/docs/rounds",
  "/docs/team": "/docs/team",
  "/docs/workspaces": "/docs/workspaces",
  "/invitations/$token": "/invitations/:token",
  "/app/": "/app",
  "/app/sign-in": "/app/sign-in",
  "/app/$workspaceSlug": "/app/:workspace",
  "/app/$workspaceSlug/activity": "/app/:workspace/activity",
  "/app/$workspaceSlug/applications/": "/app/:workspace/applications",
  "/app/$workspaceSlug/applications/$applicationRef": "/app/:workspace/applications/:application",
  "/app/$workspaceSlug/contacts": "/app/:workspace/contacts",
  "/app/$workspaceSlug/rounds/": "/app/:workspace/rounds",
  "/app/$workspaceSlug/rounds/$roundRef": "/app/:workspace/rounds/:round",
  "/app/$workspaceSlug/settings/": "/app/:workspace/settings",
  "/app/$workspaceSlug/settings/members": "/app/:workspace/settings/members",
  "/app/$workspaceSlug/work/": "/app/:workspace/work",
  "/app/$workspaceSlug/work/$assignmentId": "/app/:workspace/work/:assignment",
  "/admin/": "/admin",
  "/admin/access-requests": "/admin/access-requests",
  "/admin/organizations/": "/admin/organizations",
  "/admin/organizations/$organizationId": "/admin/organizations/:organization",
} satisfies Record<FileRouteTypes["fullPaths"], string>;

it.each(Object.entries(analyticsRouteByPage))(
  "records visits to the %s page as %s",
  (page, expected) => {
    expect(sanitizeAnalyticsPath(page.replaceAll(/\$\w+/g, "alder-1"))).toBe(expected);
  },
);
