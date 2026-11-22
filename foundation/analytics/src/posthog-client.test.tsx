import { PostHog as PostHogClient } from "posthog-js";
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
  document.title = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  client.track("demo_reset");
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
  client.track("demo_started", { guided: true, fresh: false });
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
    ["demo_started", { guided: true, fresh: false }],
  ]);

  client.track("demo_reset");

  expect(instance.capture).toHaveBeenLastCalledWith("demo_reset", undefined);
});

it("keeps at most 50 actions while PostHog loads", async () => {
  const { instance, load, finish } = deferredPostHog();
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  for (let index = 0; index < 55; index += 1) {
    client.track(index < 50 ? "demo_reset" : "access_request_submitted");
  }
  finish();
  await vi.waitFor(() => expect(instance.init).toHaveBeenCalledOnce());

  expect(instance.capture.mock.calls.map(([event]) => event)).toEqual(
    Array.from({ length: 50 }, () => "demo_reset"),
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

  expect(() => client.track("demo_reset")).not.toThrow();
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

const loadRealPostHog = async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  const posthog = new PostHogClient();
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load: async () => posthog });
  await vi.waitFor(() => expect(posthog.__loaded).toBe(true));
  const sent: unknown[] = [];
  posthog.on("eventCaptured", (event) => sent.push(event));
  return { client, sent };
};

it("sends no invitation token, workspace slug, or query string from the real PostHog client", async () => {
  const token = "0123456789abcdef0123456789abcdef";
  window.history.replaceState(null, "", `/invitations/${token}?source=email#accept`);
  vi.spyOn(document, "referrer", "get").mockReturnValue(
    "http://localhost:3000/app/alder/applications/app-9",
  );
  const { client, sent } = await loadRealPostHog();

  client.pageView();
  window.history.replaceState(null, "", "/app/alder/rounds/round-1?guide=workshop");
  document.title = "Neighbourhood food grants · Merit";
  client.pageView();
  client.track("demo_reset");

  expect(sent).toHaveLength(3);
  const payload = JSON.stringify(sent);
  for (const secret of [
    token,
    "alder",
    "round-1",
    "app-9",
    "source=email",
    "guide=workshop",
    "#accept",
    "Neighbourhood food grants",
  ]) {
    expect(payload).not.toContain(secret);
  }
});

it("sends no search terms from a search engine referrer", async () => {
  vi.spyOn(document, "referrer", "get").mockReturnValue(
    "https://www.bing.com/search?q=alder+foundation+grant",
  );
  const { client, sent } = await loadRealPostHog();

  client.pageView("/demo");
  client.track("demo_reset");

  expect(sent).toHaveLength(2);
  expect(JSON.stringify(sent)).not.toContain("alder foundation grant");
});
