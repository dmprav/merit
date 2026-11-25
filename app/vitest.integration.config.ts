import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    allowOnly: false,
    include: [
      "tests/**/*.integration.ts",
      "../capabilities/*/business/tests/**/*.integration.ts",
      "../capabilities/access/tests/**/*.integration.ts",
      "../foundation/auth/tests/**/*.integration.ts",
      "../tooling/testing/database/**/*.integration.ts",
    ],
    testTimeout: 10000,
    hookTimeout: 15000,
  },
});
