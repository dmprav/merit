import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "db:migrate": { command: "vpx scripts/migrate.ts", cache: false },
      "db:generate": { command: "drizzle-kit generate", cache: false },
      "db:check": { command: "drizzle-kit check", cache: false },
    },
  },
});
