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
  // Serve the cached static build: a fresh dev server transforms modules on first request,
  // so the first story in each worker can exceed the readiness timeout.
  webServer: {
    command: process.env.MERIT_STORYBOOK_PREBUILT
      ? "vp preview --port 6007 --strictPort"
      : "vp run build && vp preview --port 6007 --strictPort",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: "http://localhost:6007",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
