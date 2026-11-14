// Load @testing-library/jest-dom matchers before vite-plus brings in @vitest/browser matchers.
import type {} from "./ui/setup-workspace";

// Separate import-sort group keeps jest-dom augmentation ahead of vite-plus.
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { reactCompilerOptions } from "../react-compiler";
import { componentTestTimeout } from "./component-tests";

export const workspaceUiSetup = fileURLToPath(new URL("./ui/setup-workspace.ts", import.meta.url));

export const webTestConfig = ({
  tasks = true,
  typecheck = true,
}: { tasks?: boolean; typecheck?: boolean } = {}) =>
  defineConfig({
    ...(tasks
      ? {
          run: {
            tasks: {
              test: "vp test",
              ...(typecheck ? { typecheck: "tsc --noEmit -p tsconfig.json" } : {}),
            },
          },
        }
      : {}),
    test: {
      allowOnly: false,
      projects: [
        {
          test: {
            name: "unit",
            include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
          },
        },
        {
          plugins: [react({ compiler: reactCompilerOptions })],
          test: {
            name: "ui",
            environment: "jsdom",
            testTimeout: componentTestTimeout,
            environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
            include: ["src/**/*.test.tsx"],
            setupFiles: [workspaceUiSetup],
            env: { VITE_CLERK_PUBLISHABLE_KEY: "" },
          },
        },
      ],
    },
  });
