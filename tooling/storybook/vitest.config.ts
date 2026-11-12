import { fileURLToPath } from "node:url";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import previewConfig from "./vite.config";

export default defineConfig({
  // Use the same server-transport exclusions as the standalone preview.
  optimizeDeps: previewConfig.optimizeDeps,
  plugins: [storybookTest({ configDir: fileURLToPath(new URL(".storybook", import.meta.url)) })],
  test: {
    allowOnly: false,
    name: "stories",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
