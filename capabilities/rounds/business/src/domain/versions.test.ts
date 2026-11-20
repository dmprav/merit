import { expect, it } from "vite-plus/test";

import { criteriaVersionSchema } from "./versions";

it("accepts the first criteria version", () => {
  expect(criteriaVersionSchema.parse(1)).toBe(1);
});

it.each([0, -1, 1.5, NaN, Infinity, "1"])("rejects invalid criteria version %s", (value) => {
  expect(criteriaVersionSchema.safeParse(value).success).toBe(false);
});
