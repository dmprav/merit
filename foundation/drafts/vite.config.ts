import { defineConfig } from "vite-plus";

import { componentTestTimeout } from "../../tooling/testing/component-tests";
import { typecheckTask } from "../../tooling/verification/typecheck";

const policyTests = ["src/store.test.ts", "src/sessions.test.ts", "src/format.test.ts"];

export default defineConfig({
  run: { tasks: { test: "vp test", typecheck: typecheckTask } },
  test: {
    allowOnly: false,
    projects: [
      {
        extends: true,
        test: { name: "policy", environment: "node", include: policyTests },
      },
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          testTimeout: componentTestTimeout,
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: policyTests,
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
