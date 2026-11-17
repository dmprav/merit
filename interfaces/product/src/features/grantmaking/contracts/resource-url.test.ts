import { describe, expect, it } from "vite-plus/test";

import { publicIdFromRef, resourceRef } from "./resource-url";

describe("resource URLs", () => {
  const id = "b8q3w5j7c2df";

  it.each(["Workshop Saturdays!", "Updated title", "Café — summer", "", "你好", "a".repeat(200)])(
    "recovers the public ID independently of the title %j",
    (title) => {
      expect(publicIdFromRef(resourceRef(title, id))).toBe(id);
    },
  );

  it("writes the title as a lowercase, accent-free slug before the public ID", () => {
    expect(resourceRef("Café — summer", id)).toBe(`cafe-summer-${id}`);
  });

  it("limits a long title's slug to 80 characters", () => {
    expect(resourceRef("a".repeat(200), id)).toBe(`${"a".repeat(80)}-${id}`);
  });

  it.each(["", "你好", "—!"])(
    "uses a placeholder slug when the title %j has no usable characters",
    (title) => {
      expect(resourceRef(title, id)).toBe(`item-${id}`);
    },
  );

  it("accepts an ID-only reference", () => {
    expect(publicIdFromRef(id)).toBe(id);
  });

  it.each(["too-short", "title-abcdefghijkl"])("rejects %s without a valid public ID", (ref) => {
    expect(publicIdFromRef(ref)).toBeNull();
  });
});
