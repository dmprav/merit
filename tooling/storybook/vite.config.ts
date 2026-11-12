import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { reactCompilerOptions } from "../react-compiler";

export default defineConfig({
  run: {
    tasks: {
      dev: { command: "storybook dev -p 6006 --no-open", cache: false },
      test: "vp test --run --config vitest.config.ts",
      "test:watch": { command: "vp test --watch --config vitest.config.ts", cache: false },
      "test:browser": {
        command: "playwright test --config playwright.config.ts --project desktop",
        cache: false,
      },
      "test:browser:all": {
        command: "playwright test --config playwright.config.ts",
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
