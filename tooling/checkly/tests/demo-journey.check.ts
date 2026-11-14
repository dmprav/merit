import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserCheck, Frequency } from "checkly/constructs";

const currentDir = dirname(fileURLToPath(import.meta.url));

new BrowserCheck("demo-workspace-journey", {
  name: "Demo workspace provisions and loads rounds",
  frequency: Frequency.EVERY_15M,
  tags: ["browser", "demo", "database"],
  code: {
    entrypoint: join(currentDir, "demo-journey.spec.ts"),
  },
});
