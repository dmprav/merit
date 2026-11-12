import { describe, expect, it } from "vite-plus/test";

import { publicIdFromRef, resourceRef } from "./resource-url";

describe("resource URLs", () => {
  const id = "b8q3w5j7c2df";
  it("uses identity independently of the title, including ID-only links", () => {
    for (const title of [
      "Workshop Saturdays!",
      "Updated title",
      "Café — summer",
      "",
      "你好",
      "a".repeat(200),
    ]) {
      const ref = resourceRef(title, id);

      expect(publicIdFromRef(ref)).toBe(id);
      expect(ref.length).toBeLessThanOrEqual(93);
    }

    expect(resourceRef("Café — summer", id)).toBe(`cafe-summer-${id}`);
    expect(publicIdFromRef(id)).toBe(id);
    expect(publicIdFromRef("too-short")).toBeNull();
    expect(publicIdFromRef("title-abcdefghijkl")).toBeNull();
  });
});
