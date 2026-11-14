import { defineConfig } from "checkly";
import { Frequency, RetryStrategyBuilder } from "checkly/constructs";

export default defineConfig({
  projectName: "Merit",
  logicalId: "merit",
  repoUrl: "https://github.com/dmprav/merit",
  checks: {
    frequency: Frequency.EVERY_10M,
    locations: ["us-east-1", "eu-west-1"],
    tags: ["merit"],
    checkMatch: "**/tests/**/*.check.ts",
    ignoreDirectoriesMatch: ["node_modules/**"],
    retryStrategy: RetryStrategyBuilder.fixedStrategy({
      maxRetries: 1,
      baseBackoffSeconds: 30,
      sameRegion: false,
    }),
  },
  cli: {
    runLocation: "eu-west-1",
  },
});
