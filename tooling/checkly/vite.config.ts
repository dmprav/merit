import { defineConfig } from "vite-plus";

import { typecheckTask } from "../verification/typecheck";

export default defineConfig({
  run: {
    tasks: {
      typecheck: typecheckTask,
      test: "vp test",
      "test:synthetic": { command: "checkly test --config checkly.config.ts", cache: false },
      deploy: { command: "checkly deploy --config checkly.config.ts", cache: false },
    },
  },
  test: {
    allowOnly: false,
    include: ["tests/**/*.test.ts"],
  },
});
