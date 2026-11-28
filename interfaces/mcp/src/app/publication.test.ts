import { expect, it } from "vite-plus/test";

import { publication, slowToolNames } from "./publication";

it("declares an AI review as an additive, non-idempotent write that reaches an external provider", () => {
  expect(publication.run_ai_review).toEqual({
    scope: "grants:write",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    slow: true,
  });
  expect(publication.read_ai_reviews.annotations.readOnlyHint).toBe(true);
  expect([...slowToolNames]).toEqual(["run_ai_review"]);
});
