import { expect, it } from "vite-plus/test";

import { productLinks } from "./links";

it.each([
  [true, true, "rounds"],
  [true, false, "rounds"],
  [false, true, "settings/members"],
  [false, false, "work"],
] as const)(
  "builds the workspace home for grant access %s and team access %s",
  (canWorkOnGrants, canViewTeam, destination) => {
    expect(productLinks.workspaceHome({ slug: "alder/1", canWorkOnGrants, canViewTeam })).toBe(
      `/app/alder%2F1/${destination}`,
    );
  },
);

it("keeps an invitation token inside one encoded path segment", () => {
  expect(productLinks.invitation("token/with?reserved#characters")).toBe(
    "/invitations/token%2Fwith%3Freserved%23characters",
  );
});

it("encodes workspace and assignment segments for review destinations", () => {
  expect(productLinks.review("alder/1", "id/with?reserved#chars")).toBe(
    "/app/alder%2F1/work/id%2Fwith%3Freserved%23chars",
  );
});

it("encodes workspace and application segments for application destinations", () => {
  expect(productLinks.application("alder/1", "app?id#1")).toBe(
    "/app/alder%2F1/applications/app%3Fid%231",
  );
});

it("opens an application's reviews only when requested", () => {
  expect(productLinks.application("alder", "b8q3w5j7c2df", { tab: "reviews" })).toBe(
    "/app/alder/applications/b8q3w5j7c2df?tab=reviews",
  );
  expect(productLinks.application("alder", "b8q3w5j7c2df")).toBe(
    "/app/alder/applications/b8q3w5j7c2df",
  );
});
