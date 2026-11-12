import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { reactCompilerOptions } from "../../tooling/react-compiler";

export default defineConfig({
  run: { tasks: { test: "vp test" } },
  plugins: [react({ compiler: reactCompilerOptions })],
  test: {
    allowOnly: false,
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
