import type { Actor } from "@merit/auth";

export const mcpScopes = [
  "workspace:read",
  "grants:write",
  "team:write",
  "reviews:read",
  "reviews:write",
  "profile:read",
  "profile:write",
  "onboarding:read",
  "onboarding:write",
  "admin:read",
  "admin:write",
] as const;

export type McpScope = (typeof mcpScopes)[number];

export type McpActor = Actor & {
  provenance: { interface: "mcp"; clientId: string };
  scopes: readonly string[];
};
