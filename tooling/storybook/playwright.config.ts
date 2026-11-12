import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { browserConfig } from "@merit/test-support/browser/config";

export default defineConfig(browserConfig, {
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/../../snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: join(tmpdir(), "merit-storybook-results"),
  workers: 4,
  use: { baseURL: "http://localhost:6007" },
  webServer: {
    command: "node_modules/.bin/storybook dev -p 6007 --ci --no-open",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: "http://localhost:6007",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
