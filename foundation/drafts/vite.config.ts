import { defineConfig } from "vite-plus";

const policyTests = ["src/store.test.ts", "src/sessions.test.ts", "src/format.test.ts"];

export default defineConfig({
  run: { tasks: { test: "vp test", typecheck: "tsc --noEmit" } },
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
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: policyTests,
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
