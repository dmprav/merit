import type { CaptureResult, PostHog, PostHogConfig } from "posthog-js";

import { noopAnalytics, sanitizeAnalyticsPath, type AnalyticsClient } from "./index";
import { defaultPostHogHost } from "./posthog-host";

export type PostHogAnalyticsOptions = {
  apiKey?: string;
  host?: string;
  load?: () => Promise<PostHog>;
};

type QueuedAction =
  | { type: "pageView"; path?: string }
  | { type: "track"; args: Parameters<AnalyticsClient["track"]> }
  | { type: "reset" };

const maxQueuedActions = 50;

const directTraffic = "$direct";

/** Page context posthog-js adds that names a visitor or shows grant content. */
const droppedProperties = ["$ip", "title"];

const sanitizeUrl = (value: unknown) => {
  if (typeof value !== "string" || !value || value === directTraffic) {
    return value;
  }
  try {
    const parsed = new URL(value);
    const sameOrigin = typeof window !== "undefined" && parsed.origin === window.location.origin;
    parsed.pathname = sameOrigin ? sanitizeAnalyticsPath(parsed.pathname) : "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return sanitizeAnalyticsPath(value);
  }
};

// posthog-js copies the location into several properties, such as `$current_url`
// and `$session_entry_url`, so redaction follows the key's suffix, not a fixed list.
const sanitizeProperty = (key: string, value: unknown) => {
  if (key.endsWith("pathname")) {
    return typeof value === "string" ? sanitizeAnalyticsPath(value) : value;
  }
  if (key.endsWith("_url") || key.endsWith("referrer")) {
    return sanitizeUrl(value);
  }
  return value;
};

export const sanitizePostHogCapture = (result: CaptureResult): CaptureResult => {
  const properties = Object.fromEntries(
    Object.entries(result.properties)
      .filter(([key]) => !droppedProperties.includes(key))
      .map(([key, value]) => [key, sanitizeProperty(key, value)]),
  );

  return { ...result, properties };
};

export const createPostHogConfig = (host: string): Partial<PostHogConfig> => ({
  api_host: host,
  defaults: "2026-01-30",
  persistence: "memory",
  person_profiles: "never",
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_external_dependency_loading: true,
  property_denylist: droppedProperties,
  before_send: sanitizePostHogCapture,
});

const loadDefaultPostHog = async (): Promise<PostHog> => {
  const module = await import("posthog-js");
  return module.default;
};

const emitToPostHog = (instance: PostHog, action: QueuedAction) => {
  if (action.type === "reset") {
    instance.reset();
    return;
  }
  if (action.type === "track") {
    const [event, properties] = action.args;
    instance.capture(event, properties && { guided: properties.guided, fresh: properties.fresh });
    return;
  }

  const sanitized = action.path
    ? sanitizeAnalyticsPath(action.path)
    : sanitizeAnalyticsPath(window.location.pathname);
  const currentUrl = new URL(sanitized, window.location.origin).href;
  instance.capture("$pageview", {
    $current_url: currentUrl,
    $pathname: sanitized,
  });
};

/**
 * Creates a cookieless, privacy-safe PostHog analytics client.
 * Returns a no-op client during SSR or when no API key is configured.
 */
export const createPostHogAnalytics = ({
  apiKey,
  host = defaultPostHogHost,
  load = loadDefaultPostHog,
}: PostHogAnalyticsOptions): AnalyticsClient => {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey || typeof window === "undefined") {
    return noopAnalytics;
  }

  let instance: PostHog | undefined;
  let failed = false;
  const queue: QueuedAction[] = [];

  const enqueueOrEmit = (action: QueuedAction) => {
    if (failed) {
      return;
    }
    if (instance) {
      emitToPostHog(instance, action);
      return;
    }
    if (queue.length < maxQueuedActions) {
      queue.push(action);
    }
  };

  void load()
    .then((loaded) => {
      loaded.init(trimmedKey, createPostHogConfig(host.trim() || defaultPostHogHost));
      instance = loaded;
      for (const action of queue.splice(0)) {
        emitToPostHog(loaded, action);
      }
    })
    .catch(() => {
      failed = true;
      queue.length = 0;
    });

  return {
    pageView: (path) => enqueueOrEmit({ type: "pageView", path }),
    track: (...args) => enqueueOrEmit({ type: "track", args }),
    reset: () => enqueueOrEmit({ type: "reset" }),
  };
};
