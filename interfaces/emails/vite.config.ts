import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: {
        command: "email dev --dir ./src/features/organizations/previews --port 3003",
        cache: false,
      },
      build: "tsc --noEmit",
      test: "vp test",
    },
  },
  test: { allowOnly: false, environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
