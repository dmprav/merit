import { describe, expect, it } from "vite-plus/test";

import { createRoundRequestSchema } from "./preparation";

const workspaceSlug = "alder";
const requestId = "01a1bf9d-aa6f-7b30-9015-bcabb7406cbc";
describe("round creation inputs", () => {
  it.each([undefined, "", "0", "12.34"])("accepts an optional nonnegative budget: %j", (budget) => {
    expect(
      createRoundRequestSchema.parse({ workspaceSlug, requestId, title: "Round", budget }).budget,
    ).toBe(budget);
  });

  it.each(["-1", "1.001", "1e3", "9".repeat(33)])("rejects an invalid budget: %s", (budget) => {
    expect(
      createRoundRequestSchema.safeParse({ workspaceSlug, requestId, title: "Round", budget })
        .success,
    ).toBe(false);
  });
});
