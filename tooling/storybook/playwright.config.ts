import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { browserConfig } from "@merit/test-support/browser/config";

const rootEnvFile = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const readPort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port value: ${value}`);
  }
  return parsed;
};

const storybookPort = readPort(process.env.MERIT_STORYBOOK_PORT, 6007);
const baseURL = `http://localhost:${storybookPort}`;

export default defineConfig(browserConfig, {
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/../../snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: join(tmpdir(), `merit-storybook-results-${storybookPort}`),
  workers: 4,
  use: { baseURL },
  // Serve the cached static build: a fresh dev server transforms modules on first request,
  // so the first story in each worker can exceed the readiness timeout.
  webServer: {
    command: process.env.MERIT_STORYBOOK_PREBUILT
      ? `vp preview --port ${storybookPort} --strictPort`
      : `vp run build && vp preview --port ${storybookPort} --strictPort`,
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
