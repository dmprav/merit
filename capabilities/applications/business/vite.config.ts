import { businessTestConfig } from "../../../tooling/verification/business-test-config";

export default businessTestConfig(
  [
    "src/server/persistence/encoding.ts",
    "src/server/persistence/history-encoding.ts",
    "src/server/persistence/history-format.ts",
  ],
  ["src/examples/example-data.ts"],
);
