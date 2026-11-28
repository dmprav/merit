import { describe, expect, test } from "vite-plus/test";

import { collectUnreadVerifications, isProductionSourcePath } from "./repo-paths.ts";

describe("repository paths", () => {
  test("lists verification records newer than the cursor pull request in order", () => {
    const tracked = [
      "docs/README.md",
      "verifications/217.md",
      "verifications/208.md",
      "verifications/216.md",
      "verifications/notes.md",
    ];
    expect(collectUnreadVerifications(tracked, 208)).toEqual([
      { prNumber: 216, path: "verifications/216.md" },
      { prNumber: 217, path: "verifications/217.md" },
    ]);
    expect(collectUnreadVerifications(tracked, undefined)).toHaveLength(3);
  });

  test("treats tests, fixtures, stories, and vite config as non-production", () => {
    expect(isProductionSourcePath("foundation/ui/src/button.tsx")).toBe(true);
    expect(isProductionSourcePath("foundation/ui/src/button.test.tsx")).toBe(false);
    expect(isProductionSourcePath("tooling/testing/browser/config.ts")).toBe(false);
    expect(isProductionSourcePath("app/vite.config.ts")).toBe(false);
  });
});
