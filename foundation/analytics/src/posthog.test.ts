import type { CaptureResult } from "posthog-js";
import { expect, it, vi } from "vite-plus/test";

import { createPostHogAnalytics, createPostHogConfig, sanitizePostHogCapture } from "./posthog";

it("returns a no-op client during SSR when window is unavailable", () => {
  const load = vi.fn();
  const client = createPostHogAnalytics({ apiKey: "phc_test_key", load });

  client.pageView("/demo");
  client.track("demo_reset");
  client.reset();

  expect(load).not.toHaveBeenCalled();
});

it("configures PostHog for cookieless, non-autocapture analytics", () => {
  const config = createPostHogConfig("https://eu.i.posthog.com");

  expect(config).toMatchObject({
    api_host: "https://eu.i.posthog.com",
    persistence: "memory",
    person_profiles: "never",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    property_denylist: ["$ip", "title"],
    before_send: sanitizePostHogCapture,
  });
});

it("redacts relative URLs that cannot be parsed as absolute addresses", () => {
  const sanitized = sanitizePostHogCapture({
    uuid: "event-1",
    event: "$pageview",
    properties: {
      $current_url: "/app/alder/rounds/round-1?guide=workshop",
      $referrer: "/invitations/secret-token-123",
    },
  });

  expect(sanitized.properties).toEqual({
    $current_url: "/app/:workspace/rounds/:round",
    $referrer: "/invitations/:token",
  });
});

it("strips tokens, query strings, tenant slugs, and IP properties before sending", () => {
  const result: CaptureResult = {
    uuid: "event-1",
    event: "$pageview",
    properties: {
      $pathname: "/invitations/secret-token-123",
      $prev_pageview_pathname: "/app/alder/applications/app-1",
      $current_url: "https://merit.example/invitations/secret-token-123?utm=test#hash",
      $referrer: "https://external.example/secret/path?token=123",
      $ip: "192.0.2.1",
      guided: true,
    },
  };

  const sanitized = sanitizePostHogCapture(result);

  expect(sanitized.properties).toEqual({
    $pathname: "/invitations/:token",
    $prev_pageview_pathname: "/app/:workspace/applications/:application",
    $current_url: "https://merit.example/",
    $referrer: "https://external.example/",
    guided: true,
  });
});

it("redacts every location property posthog-js adds and drops the page title", () => {
  const sanitized = sanitizePostHogCapture({
    uuid: "event-1",
    event: "$pageview",
    properties: {
      $session_entry_url: "https://merit.example/invitations/secret-token-123?source=email",
      $session_entry_pathname: "/app/alder/applications/app-1",
      $session_entry_referrer: "https://external.example/secret/path",
      $referrer: "$direct",
      title: "Neighbourhood food grants · Merit",
    },
  });

  expect(sanitized.properties).toEqual({
    $session_entry_url: "https://merit.example/",
    $session_entry_pathname: "/app/:workspace/applications/:application",
    $session_entry_referrer: "https://external.example/",
    $referrer: "$direct",
  });
});
