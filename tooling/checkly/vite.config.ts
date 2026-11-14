import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      typecheck: "tsc --noEmit",
      test: { command: "checkly test --config checkly.config.ts", cache: false },
      deploy: { command: "checkly deploy --config checkly.config.ts", cache: false },
    },
  },
});
