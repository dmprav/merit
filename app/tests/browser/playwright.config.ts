import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { browserConfig } from "@merit/test-support/browser/config";

import { appOrigin, appPort } from "./ports.ts";

export default defineConfig(browserConfig, {
  testMatch: "application.spec.ts",
  use: { baseURL: appOrigin },
  webServer: {
    command: `../node_modules/.bin/vp dev --port ${appPort}`,
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    url: appOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "", CLERK_PUBLISHABLE_KEY: "" },
  },
});
