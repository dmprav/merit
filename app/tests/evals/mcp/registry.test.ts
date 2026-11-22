import { assert, expect, it } from "vite-plus/test";

import { evalCases } from "./registry";

it("identifies every scenario uniquely, including its held-out wording", () => {
  expect(new Set(evalCases.map(({ id }) => id)).size).toBe(evalCases.length);
});

it.each([
  ["track-review", "reserve-track-review"],
  ["compose-invite", "reserve-write-invite"],
])("runs %s and its wording variant with the same grants", (original, variant) => {
  const base = evalCases.find(({ id }) => id === original);
  const heldOut = evalCases.find(({ id }) => id === variant);
  assert(base && heldOut);
  expect(heldOut.profile).toBe(base.profile);
  expect(heldOut.partition).toBe("held-out");
});
