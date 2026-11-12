import type { TestUserConfig } from "vite-plus";

export const coverageDefaults = {
  provider: "v8",
  reporter: ["text", "html", "json-summary"],
  reportOnFailure: true,
  thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
} satisfies TestUserConfig["coverage"];
