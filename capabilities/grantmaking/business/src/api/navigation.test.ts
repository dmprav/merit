import { expect, it } from "vite-plus/test";

import { changeNavigationPinSchema } from "./navigation";

it.each([
  { action: "pin", target: { kind: "round", id: "k7m2p9x4n6rt" } },
  { action: "unpin", target: { kind: "application", id: "b8q3w5j7c2df" } },
  {
    action: "move",
    target: { kind: "review", id: "6dfe65e7-b608-413c-8a9a-526e361a507c" },
    before: null,
  },
])("accepts a typed personal-navigation command: %j", (input) => {
  expect(changeNavigationPinSchema.parse(input)).toEqual(input);
});

it.each([
  { action: "pin", target: { kind: "application", id: "invalid" } },
  { action: "pin", target: { kind: "review", id: "b8q3w5j7c2df" } },
  { action: "pin", target: { kind: "round", id: "k7m2p9x4n6rt" }, userId: "another-person" },
  { action: "move", target: { kind: "round", id: "k7m2p9x4n6rt" } },
])("rejects invalid navigation commands: %j", (input) => {
  expect(changeNavigationPinSchema.safeParse(input).success).toBe(false);
});
