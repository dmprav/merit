import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { browserConfig } from "@merit/test-support/browser/config";

import { workspaceOrigin, workspacePort } from "./ports.ts";

const host = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(browserConfig, {
  testMatch: [
    "round-preparation.spec.ts",
    "workspace.spec.ts",
    "navigation.spec.ts",
    "provisioning.spec.ts",
    "devtools.spec.ts",
    "team.spec.ts",
    "application-intake.spec.ts",
    "reviews.spec.ts",
    "reviewer.spec.ts",
  ],
  outputDir: join(tmpdir(), `merit-workspace-browser-results-${workspacePort}`),
  timeout: 60_000,
  // Each test resets the isolated database used by the shared host.
  workers: 1,
  use: { baseURL: workspaceOrigin },
  webServer: {
    // The worker runs beside the web server, as in development, so background work is delivered.
    command: `../node_modules/.bin/vpx scripts/with-worker.ts ../node_modules/.bin/vp dev --mode local-workspace --port ${workspacePort}`,
    cwd: host,
    url: `${workspaceOrigin}/app`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Local identity must take precedence over configured Clerk UI/middleware.
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZSQ=",
    },
  },
});
