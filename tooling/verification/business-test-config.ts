import { defineConfig } from "vite-plus";

import { coverageDefaults } from "./coverage";

export const businessTestConfig = (include: string[] = [], exclude: string[] = []) =>
  defineConfig({
    run: {
      tasks: {
        test: {
          command: "vp test --coverage",
          cache: { input: [{ auto: true }, "!coverage/**"] },
        },
      },
    },
    test: {
      allowOnly: false,
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
      coverage: {
        ...coverageDefaults,
        include: ["src/domain/**/*.ts", "src/api/**/*.ts", ...include],
        exclude: ["**/*.test.ts", ...exclude],
      },
    },
  });
