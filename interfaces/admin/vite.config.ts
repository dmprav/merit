import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { reactCompilerOptions } from "../../tooling/react-compiler";
import { componentTestTimeout } from "../../tooling/testing/component-tests";

export default defineConfig({
  run: { tasks: { test: "vp test" } },
  plugins: [react({ compiler: reactCompilerOptions })],
  test: {
    allowOnly: false,
    environment: "jsdom",
    testTimeout: componentTestTimeout,
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./tests/setup-ui.ts"],
  },
});
