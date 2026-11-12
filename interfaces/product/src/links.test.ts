import { expect, it } from "vite-plus/test";

import { productLinks } from "./links";

it("keeps an invitation token inside one encoded path segment", () => {
  expect(productLinks.invitation("token/with?reserved#characters")).toBe(
    "/invitations/token%2Fwith%3Freserved%23characters",
  );
});
