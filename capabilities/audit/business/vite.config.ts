import { defineConfig } from "vite-plus";

import { coverageDefaults } from "../../../tooling/verification/coverage";

export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test --coverage",
        cache: { input: [{ auto: true }, "!coverage/**"] },
      },
      typecheck: "tsc --noEmit",
    },
  },
  test: {
    allowOnly: false,
    include: ["src/**/*.test.ts"],
    coverage: {
      ...coverageDefaults,
      include: ["src/domain/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
