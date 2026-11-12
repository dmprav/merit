import { defineConfig } from "vite-plus";

export default defineConfig({
  run: { tasks: { test: "vp test" } },
  test: { allowOnly: false, include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
});
