import { defineConfig } from "vite-plus";

import { typecheckTask } from "../../tooling/verification/typecheck";

export default defineConfig({
  run: { tasks: { test: "vp test", typecheck: typecheckTask } },
  test: { allowOnly: false, include: ["src/**/*.test.ts"] },
});
