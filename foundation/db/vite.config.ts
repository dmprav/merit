import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      test: "vp test",
      "db:migrate": { command: "vpx scripts/migrate.ts", cache: false },
      "db:generate": { command: "drizzle-kit generate", cache: false },
      "db:check": { command: "drizzle-kit check", cache: false },
    },
  },
  test: { allowOnly: false, include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
});
