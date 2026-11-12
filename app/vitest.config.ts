import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { reactCompilerOptions } from "../tooling/react-compiler";
import { componentTestTimeout } from "../tooling/testing/component-tests";

export default defineConfig({
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
          setupFiles: ["./tests/setup-ui.ts"],
          env: { VITE_CLERK_PUBLISHABLE_KEY: "" },
        },
      },
    ],
  },
});
