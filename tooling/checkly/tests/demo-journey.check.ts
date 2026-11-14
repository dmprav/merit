import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserCheck, Frequency } from "checkly/constructs";

import { resolveTargetBaseUrl } from "./target";

const currentDir = dirname(fileURLToPath(import.meta.url));
const baseUrl = resolveTargetBaseUrl();

new BrowserCheck("demo-workspace-journey", {
  name: "Demo workspace provisions and loads rounds",
  frequency: Frequency.EVERY_15M,
  tags: ["browser", "demo", "database"],
  environmentVariables: [{ key: "MERIT_BASE_URL", value: baseUrl }],
  code: {
    entrypoint: join(currentDir, "demo-journey.spec.ts"),
  },
});
