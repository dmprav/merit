import { describe, expect, test } from "vite-plus/test";

import {
  collectUnreadVerifications,
  listDocAreas,
  listMcpDbSlices,
  listPackageSlices,
  listSecuritySlices,
} from "./repo-paths.ts";

const tracked = [
  "README.md",
  "docs/README.md",
  "docs/guides/testing.md",
  ".github/pull_request_template.md",
  ".agents/tasks/scout.md",
  "verifications/208.md",
  "verifications/216.md",
  "verifications/217.md",
  "app/src/server/identity.ts",
  "capabilities/reviews/business/src/index.ts",
  "foundation/ui/README.md",
  "tooling/testing/browser/config.ts",
];

const domainScoped = [
  "docs/guides/testing.md",
  "app/src/server/middleware.ts",
  "capabilities/reviews/business/src/server/service.ts",
  "capabilities/rounds/ai/src/tools.ts",
  "foundation/auth/src/index.ts",
  "foundation/dates/src/index.ts",
  "foundation/db/src/schema.ts",
  "interfaces/mcp/src/server.ts",
];

describe("scout repository slices", () => {
  test("groups documentation by area, skipping agent, workflow, and verification records", () => {
    expect(listDocAreas(tracked)).toEqual([".", "docs/guides", "foundation/ui"]);
  });

  test("lists package slices including the app and testing tooling", () => {
    expect(listPackageSlices(tracked)).toEqual([
      "app",
      "capabilities/reviews",
      "foundation/ui",
      "tooling/testing",
    ]);
  });

  test("lists security slices for the app, capabilities, and security-sensitive foundations", () => {
    expect(listSecuritySlices(domainScoped)).toEqual([
      "app",
      "capabilities/reviews",
      "capabilities/rounds",
      "foundation/auth",
      "foundation/db",
      "interfaces/mcp",
    ]);
  });

  test("lists MCP and database slices for capability servers and AI, the database, and MCP", () => {
    expect(listMcpDbSlices(domainScoped)).toEqual([
      "capabilities/reviews",
      "capabilities/rounds",
      "foundation/db",
      "interfaces/mcp",
    ]);
  });

  test("lists verification records newer than the cursor pull request in order", () => {
    expect(collectUnreadVerifications(tracked, 208)).toEqual([
      { prNumber: 216, path: "verifications/216.md" },
      { prNumber: 217, path: "verifications/217.md" },
    ]);
  });
});
