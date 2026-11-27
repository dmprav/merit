import { defineConfig } from "vite-plus";

export default defineConfig({
  run: { tasks: { test: "vp test", typecheck: "tsc --noEmit" } },
  test: { allowOnly: false, include: ["src/**/*.test.ts"] },
});
