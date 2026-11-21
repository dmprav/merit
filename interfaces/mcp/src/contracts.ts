import type { Actor } from "@merit/auth";

export const mcpScopes = [
  "workspace:read",
  "grants:write",
  "reviews:read",
  "reviews:write",
  "onboarding:write",
] as const;

export type McpScope = (typeof mcpScopes)[number];

export type McpActor = Actor & {
  provenance: { interface: "mcp"; clientId: string };
  scopes: readonly string[];
};
