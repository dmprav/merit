import { existsSync } from "node:fs";
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { reactCompilerOptions } from "../react-compiler";

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

const storybookDevPort = readPort(process.env.MERIT_STORYBOOK_DEV_PORT, 6006);

export default defineConfig({
  run: {
    tasks: {
      dev: { command: `storybook dev -p ${storybookDevPort}`, cache: false },
      test: "vp test --run --config vitest.config.ts",
      "test:watch": {
        command: "vp test --watch --config vitest.config.ts",
        cache: false,
      },
      "test:browser": {
        command: "playwright test --config playwright.config.ts --project=desktop",
        cache: false,
      },
      "test:browser:all": {
        command: "playwright test --config playwright.config.ts",
        cache: false,
      },
      "build:design-system": {
        command: "vpx design-system/build.ts",
        cache: false,
      },
      build: {
        command: "storybook build --output-dir dist",
        cache: {
          input: [{ auto: true }, "!node_modules/.cache/storybook/**", "!dist/**"],
          output: ["dist/**"],
        },
      },
    },
  },
  optimizeDeps: {
    // Server transports are replaced by preview mocks before rendering.
    exclude: [
      "@tanstack/react-start",
      "@tanstack/react-start/server",
      "@clerk/tanstack-react-start",
    ],
    include: ["@tanstack/react-query", "@tanstack/react-router"],
  },
  plugins: [react({ compiler: reactCompilerOptions })],
});
