import { createMCPClient } from "@tanstack/ai-mcp";

import type { McpDependencies } from "../src/app/server";
import { mcpScopes, type McpActor } from "../src/contracts";
import { handleWorkspaceMcp } from "../src/index";

export const endpoint = new URL("http://localhost:3000/mcp/workspace");
export const actor: McpActor = {
  userId: "test-manager",
  provenance: { interface: "mcp", clientId: "verified-client" },
  scopes: mcpScopes,
};

export const connect = (operations: McpDependencies, scopes: readonly string[] = mcpScopes) =>
  createMCPClient({
    name: "untrusted-client-name",
    transport: {
      type: "http",
      url: endpoint.href,
      fetch: (input, init) => {
        const request = new Request(input, init);
        request.headers.set("host", endpoint.host);
        return handleWorkspaceMcp(request, endpoint.href, {
          ...operations,
          authenticate: async () => ({ ...actor, scopes }),
        });
      },
    },
  });
