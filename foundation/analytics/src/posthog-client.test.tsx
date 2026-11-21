import { afterEach, expect, it, vi } from "vite-plus/test";

import {
  createPostHogAnalytics,
  createPostHogConfig,
  sanitizePostHogCapture,
  type PostHogAnalyticsOptions,
} from "./posthog";

type PostHog = Awaited<ReturnType<NonNullable<PostHogAnalyticsOptions["load"]>>>;

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

const deferredPostHog = () => {
  const instance = {
    init: vi.fn(),
    capture: vi.fn<(event: string, properties?: Record<string, unknown>) => void>(),
    reset: vi.fn(),
  };
  let finish!: () => void;
  const load = vi.fn(
    () =>
      new Promise<PostHog>((resolve) => {
        finish = () => resolve(instance as unknown as PostHog);
      }),
  );
  return { instance, load, finish: () => finish() };
};

it("returns a no-op client when the PostHog API key is missing", () => {
  const load = vi.fn();
  const client = createPostHogAnalytics({ apiKey: "   ", load });

  client.pageView("/demo");
  client.track("demo_started");
  client.reset();

  expect(load).not.toHaveBeenCalled();
});

it("initializes PostHog with the privacy configuration for the trimmed key and host", async () => {
  const { instance, load, finish } = deferredPostHog();
  createPostHogAnalytics({ apiKey: " phc_test_key ", host: " https://posthog.example ", load });
  finish();

  await vi.waitFor(() =>
    expect(instance.init).toHaveBeenCalledExactlyOnceWith(
      "phc_test_key",
      createPostHogConfig("https://posthog.example"),
    ),
  );
});

it("sends events to the EU PostHog host when the configured host is blank", async () => {
  const { instance, load, finish } = deferredPostHog();
  createPostHogAnalytics({ apiKey: "phc_test_key", host: "   ", load });
  finish();

  await vi.waitFor(() =>
    expect(instance.init).toHaveBeenCalledExactlyOnceWith(
      "phc_test_key",
      expect.objectContaining({ api_host: "https://eu.i.posthog.com" }),
    ),
  );
});

it("queues actions until PostHog loads, then sends them in order and later ones directly", async () => {
  const { instance, load, finish } = deferredPostHog();
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  client.pageView("/invitations/secret-token-xyz");
  client.track("demo_started", { guided: true });
  client.reset();

  expect(instance.capture).not.toHaveBeenCalled();
  expect(instance.reset).not.toHaveBeenCalled();

  finish();
  await vi.waitFor(() => expect(instance.reset).toHaveBeenCalledOnce());

  expect(instance.capture.mock.calls).toEqual([
    [
      "$pageview",
      {
        $current_url: "http://localhost:3000/invitations/:token",
        $pathname: "/invitations/:token",
      },
    ],
    ["demo_started", { guided: true }],
  ]);

  client.track("demo_reset");

  expect(instance.capture).toHaveBeenLastCalledWith("demo_reset", undefined);
});

it("keeps at most 50 actions while PostHog loads", async () => {
  const { instance, load, finish } = deferredPostHog();
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  for (let index = 0; index < 55; index += 1) {
    client.track(`event_${index}`);
  }
  finish();
  await vi.waitFor(() => expect(instance.init).toHaveBeenCalledOnce());

  expect(instance.capture.mock.calls.map(([event]) => event)).toEqual(
    Array.from({ length: 50 }, (_, index) => `event_${index}`),
  );
});

it("records the current location's redacted path when a page view names no path", async () => {
  const { instance, load, finish } = deferredPostHog();
  window.history.replaceState(null, "", "/app/alder/rounds/round-1?guide=workshop");
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  client.pageView();
  finish();

  await vi.waitFor(() =>
    expect(instance.capture).toHaveBeenCalledExactlyOnceWith("$pageview", {
      $current_url: "http://localhost:3000/app/:workspace/rounds/:round",
      $pathname: "/app/:workspace/rounds/:round",
    }),
  );
});

it("degrades silently to no-op if loading PostHog fails", async () => {
  const load = vi.fn().mockRejectedValue(new Error("Blocked by client"));
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  client.pageView("/demo");
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());

  expect(() => client.track("demo_started")).not.toThrow();
  expect(() => client.reset()).not.toThrow();
});

it("keeps the redacted route in same-origin URLs before sending", () => {
  const sanitized = sanitizePostHogCapture({
    uuid: "event-1",
    event: "$pageview",
    properties: {
      $current_url: "http://localhost:3000/app/alder/rounds/round-1?utm=test#hash",
      $referrer: "http://localhost:3000/invitations/secret-token-123",
    },
  });

  expect(sanitized.properties).toEqual({
    $current_url: "http://localhost:3000/app/:workspace/rounds/:round",
    $referrer: "http://localhost:3000/invitations/:token",
  });
});
