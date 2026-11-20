import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "./versions";

it("accepts the first material version", () => {
  expect(materialVersionSchema.parse(1)).toBe(1);
});

it.each([0, -1, 1.5, NaN, Infinity, "1"])("rejects invalid material version %s", (value) => {
  expect(materialVersionSchema.safeParse(value).success).toBe(false);
});
