import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { mcpScopes, type McpActor } from "../src/contracts";
import { handleWorkspaceMcp } from "../src/index";
import type { testOperations } from "./operations";

export const endpoint = new URL("http://localhost:3000/mcp/workspace");
export const actor: McpActor = {
  userId: "test-manager",
  provenance: { interface: "mcp", clientId: "verified-client" },
  scopes: mcpScopes,
};

export const connect = async (
  operations: ReturnType<typeof testOperations>,
  scopes: readonly string[] = mcpScopes,
) => {
  const client = new Client({ name: "untrusted-client-name", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      fetch: (input, init) => {
        const request = new Request(input, init);
        request.headers.set("host", endpoint.host);
        return handleWorkspaceMcp(request, endpoint.href, {
          ...operations,
          authenticate: async () => ({ ...actor, scopes }),
        });
      },
    }),
  );
  return client;
};
