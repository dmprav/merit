import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    allowOnly: false,
    bail: ["codex", "claude"].includes(process.env.MERIT_EVAL_MODE ?? "") ? 1 : 0,
    include: ["tests/evals/mcp/suite.eval.ts"],
    testTimeout: 240_000,
    hookTimeout: 30_000,
  },
});
