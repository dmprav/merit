import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { browserProjects } from "@merit/test-support/browser/config";

const host = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  forbidOnly: true,
  testDir: ".",
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
  outputDir: join(tmpdir(), "merit-workspace-browser-results"),
  reporter: "list",
  // Each test resets the isolated database used by the shared host.
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: browserProjects,
  webServer: {
    command: "../node_modules/.bin/vp run @merit/app#dev:workspace --port 3002",
    cwd: host,
    url: "http://127.0.0.1:3002/app",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Local identity must take precedence over configured Clerk UI/middleware.
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZSQ=",
    },
  },
});
