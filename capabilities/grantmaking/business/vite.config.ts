import { businessTestConfig } from "../../../tooling/verification/business-test-config";

export default businessTestConfig(
  ["src/server/persistence/encoding.ts", "src/examples/**/*.ts"],
  ["src/examples/example-data.ts"],
);
