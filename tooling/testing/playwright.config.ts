import { defineConfig } from "@playwright/test";

import { browserConfig } from "./browser/config";

export default defineConfig(browserConfig, {
  testDir: "browser",
  testMatch: "checks.spec.ts",
});
