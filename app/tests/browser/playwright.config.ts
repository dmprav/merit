import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { browserConfig } from "@merit/test-support/browser/config";

export default defineConfig(browserConfig, {
  testMatch: "application.spec.ts",
  use: { baseURL: "http://localhost:3001" },
  webServer: {
    command: "../node_modules/.bin/vp dev --port 3001",
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "", CLERK_PUBLISHABLE_KEY: "" },
  },
});
