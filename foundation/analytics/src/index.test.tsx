import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { AnalyticsProvider, noopAnalytics, sanitizeAnalyticsPath, useAnalytics } from "./index";
import { createPostHogAnalytics } from "./posthog";

const Probe = () => {
  const analytics = useAnalytics();
  return (
    <button
      type="button"
      onClick={() => {
        analytics.pageView("/demo");
        analytics.track("demo_started", { guided: true });
        analytics.reset();
      }}
    >
      Trigger
    </button>
  );
};

it("provides a safe no-op client by default when no provider is mounted", () => {
  render(<Probe />);
  screen.getByRole("button", { name: "Trigger" }).click();

  expect(() => noopAnalytics.pageView("/")).not.toThrow();
  expect(() => noopAnalytics.track("demo_started")).not.toThrow();
  expect(() => noopAnalytics.reset()).not.toThrow();
});

it("forwards page views, events, and resets to the provided client", () => {
  const client = {
    pageView: vi.fn(),
    track: vi.fn(),
    reset: vi.fn(),
  };

  render(
    <AnalyticsProvider client={client}>
      <Probe />
    </AnalyticsProvider>,
  );

  screen.getByRole("button", { name: "Trigger" }).click();

  expect(client.pageView).toHaveBeenCalledExactlyOnceWith("/demo");
  expect(client.track).toHaveBeenCalledExactlyOnceWith("demo_started", { guided: true });
  expect(client.reset).toHaveBeenCalledOnce();
});

it("sanitizes confidential route parameters and keeps public routes readable", () => {
  expect(sanitizeAnalyticsPath("/")).toBe("/");
  expect(sanitizeAnalyticsPath("/privacy")).toBe("/privacy");
  expect(sanitizeAnalyticsPath("/docs/mcp/")).toBe("/docs/mcp");
  expect(sanitizeAnalyticsPath("/demo/workshop-saturdays?foo=bar#top")).toBe(
    "/demo/workshop-saturdays",
  );
  expect(sanitizeAnalyticsPath("/invitations/secret-token-123")).toBe("/invitations/:token");
  expect(sanitizeAnalyticsPath("/reviews/assign-123")).toBe("/reviews/:assignment");
  expect(sanitizeAnalyticsPath("/admin/organizations/new")).toBe("/admin/organizations/new");
  expect(sanitizeAnalyticsPath("/admin/organizations/org-123")).toBe(
    "/admin/organizations/:organization",
  );
  expect(sanitizeAnalyticsPath("/app")).toBe("/app");
  expect(sanitizeAnalyticsPath("/app/sign-in")).toBe("/app/sign-in");
  expect(sanitizeAnalyticsPath("/app/alder")).toBe("/app/:workspace");
  expect(sanitizeAnalyticsPath("/app/alder/rounds")).toBe("/app/:workspace/rounds");
  expect(sanitizeAnalyticsPath("/app/alder/rounds/round-1")).toBe("/app/:workspace/rounds/:round");
  expect(sanitizeAnalyticsPath("/app/alder/applications/app-1?guide=workshop")).toBe(
    "/app/:workspace/applications/:application",
  );
  expect(sanitizeAnalyticsPath("/app/alder/contacts/contact-1")).toBe(
    "/app/:workspace/contacts/:contact",
  );
});

it("returns a no-op client when PostHog API key is missing", () => {
  const load = vi.fn();
  const client = createPostHogAnalytics({ apiKey: "   ", load });

  client.pageView("/demo");
  client.track("demo_started");
  client.reset();

  expect(load).not.toHaveBeenCalled();
});

it("queues events until PostHog finishes loading and drops nothing on init failure", async () => {
  const init = vi.fn();
  const capture = vi.fn();
  const reset = vi.fn();
  let resolveLoad: ((value: never) => void) | undefined;
  const load = vi.fn(
    () =>
      new Promise<never>((resolve) => {
        resolveLoad = resolve;
      }),
  );

  const client = createPostHogAnalytics({
    apiKey: "phc_test_key",
    host: "https://eu.i.posthog.com",
    load,
  });

  client.pageView("/invitations/secret-token-xyz");
  client.track("demo_started", { guided: true });
  client.reset();

  expect(init).not.toHaveBeenCalled();

  resolveLoad?.({ init, capture, reset } as never);
  await vi.waitFor(() => expect(init).toHaveBeenCalledOnce());

  expect(init).toHaveBeenCalledWith(
    "phc_test_key",
    expect.objectContaining({
      api_host: "https://eu.i.posthog.com",
      persistence: "memory",
      person_profiles: "never",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
    }),
  );
  expect(capture).toHaveBeenNthCalledWith(1, "$pageview", {
    $current_url: "http://localhost:3000/invitations/:token",
    $pathname: "/invitations/:token",
  });
  expect(capture).toHaveBeenNthCalledWith(2, "demo_started", { guided: true });
  expect(reset).toHaveBeenCalledOnce();

  client.track("demo_reset");
  expect(capture).toHaveBeenNthCalledWith(3, "demo_reset", undefined);
});

it("degrades silently to no-op if loading PostHog fails", async () => {
  const load = vi.fn().mockRejectedValue(new Error("Blocked by client"));
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  client.pageView("/demo");
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());

  expect(() => client.track("demo_started")).not.toThrow();
  expect(() => client.reset()).not.toThrow();
});
