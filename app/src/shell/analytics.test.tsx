import { act, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useAnalytics } from "@merit/analytics";
import { createPostHogAnalytics } from "@merit/analytics/posthog";

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
    <button type="button" onClick={() => analytics.track("demo_started")}>
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
  expect(client.track).toHaveBeenCalledExactlyOnceWith("demo_started");
});
