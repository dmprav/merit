import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { AnalyticsProvider, sanitizeAnalyticsPath, useAnalytics } from "./index";

const Probe = () => {
  const analytics = useAnalytics();
  return (
    <button
      type="button"
      onClick={() => {
        analytics.pageView("/demo");
        analytics.track("demo_started", { guided: true, fresh: false });
        analytics.reset();
      }}
    >
      Trigger
    </button>
  );
};

it("lets components record analytics without a provider", () => {
  render(<Probe />);

  expect(() => screen.getByRole("button", { name: "Trigger" }).click()).not.toThrow();
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
  expect(client.track).toHaveBeenCalledExactlyOnceWith("demo_started", {
    guided: true,
    fresh: false,
  });
  expect(client.reset).toHaveBeenCalledOnce();
});

it.each([
  ["/", "/"],
  ["/privacy", "/privacy"],
  ["/docs/mcp/", "/docs/mcp"],
  ["/demo/workshop-saturdays?foo=bar#top", "/demo/workshop-saturdays"],
  ["/admin/organizations", "/admin/organizations"],
  ["/app", "/app"],
  ["/app/sign-in", "/app/sign-in"],
])("keeps the public route %s readable as %s", (path, expected) => {
  expect(sanitizeAnalyticsPath(path)).toBe(expected);
});

it.each([
  ["/invitations/secret-token-123", "/invitations/:token"],
  ["/admin/organizations/org-123", "/admin/organizations/:organization"],
  ["/app/alder", "/app/:workspace"],
  ["/app/alder/rounds", "/app/:workspace/rounds"],
  ["/app/alder/rounds/round-1", "/app/:workspace/rounds/:round"],
  ["/app/alder/applications/app-1?guide=workshop", "/app/:workspace/applications/:application"],
  ["/app/alder/contacts", "/app/:workspace/contacts"],
  ["/app/alder/settings/members", "/app/:workspace/settings/members"],
  ["/app/alder/work", "/app/:workspace/work"],
  ["/app/alder/work/assign-123", "/app/:workspace/work/:assignment"],
])("redacts confidential parameters in %s as %s", (path, expected) => {
  expect(sanitizeAnalyticsPath(path)).toBe(expected);
});

it.each([
  ["/Invitations/0123abcdef", "/invitations/:token"],
  ["/APP/Alder/Rounds/Round-1/", "/app/:workspace/rounds/:round"],
])("matches routes regardless of case, recording %s as %s", (path, expected) => {
  expect(sanitizeAnalyticsPath(path)).toBe(expected);
});

it.each([
  ["/invitations"],
  ["/app/alder/contacts/contact-7"],
  ["/app/alder/unknown"],
  ["/alder-foundation?token=123"],
])("records the unrecognized path %s as /*other", (path) => {
  expect(sanitizeAnalyticsPath(path)).toBe("/*other");
});
