import { defineConfig } from "vite-plus";

import { componentTestTimeout } from "./component-tests";

export default defineConfig({
  run: {
    tasks: {
      test: "vp test",
      "test:browser": {
        command: "playwright test --config playwright.config.ts --project desktop",
        cache: false,
      },
      "test:browser:all": {
        command: "playwright test --config playwright.config.ts",
        cache: false,
      },
    },
  },
  test: {
    allowOnly: false,
    environment: "jsdom",
    testTimeout: componentTestTimeout,
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    include: ["ui/**/*.test.ts"],
    setupFiles: ["./ui/setup-workspace.ts"],
  },
});
