import { expect, it } from "vite-plus/test";

import { productLinks } from "./links";

it("keeps an invitation token inside one encoded path segment", () => {
  expect(productLinks.invitation("token/with?reserved#characters")).toBe(
    "/invitations/token%2Fwith%3Freserved%23characters",
  );
});

it("encodes workspace and application segments for review and application destinations", () => {
  expect(productLinks.review("id/with?reserved#chars")).toBe(
    "/reviews/id%2Fwith%3Freserved%23chars",
  );
  expect(productLinks.application("alder/1", "app?id#1", { tab: "reviews" })).toBe(
    "/app/alder%2F1/applications/app%3Fid%231?tab=reviews",
  );
  expect(productLinks.application("alder", "b8q3w5j7c2df")).toBe(
    "/app/alder/applications/b8q3w5j7c2df",
  );
});
