import { defineConfig } from "vite-plus";

import { coverageDefaults } from "../../../tooling/verification/coverage";
import { typecheckTask } from "../../../tooling/verification/typecheck";

export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test --coverage",
        cache: { input: [{ auto: true }, "!coverage/**"] },
      },
      typecheck: typecheckTask,
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
