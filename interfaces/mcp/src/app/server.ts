import { createMCPServer } from "@tanstack/ai-mcp/server";

import { mcpScopes, type McpActor } from "../contracts";
import type { McpOperations } from "./operations";
import { createMcpCatalog } from "./tools";

export const createWorkspaceServer = (
  actor: McpActor,
  operations: McpOperations,
  origin: string,
) => {
  const catalog = createMcpCatalog(actor, operations, origin);
  return createMCPServer({
    name: "merit-workspace",
    version: "1.0.0",
    // TanStack's standard publication path has no per-tool OAuth challenge.
    // Its setup hook exposes the same bound tools with the SDK's step-up check.
    setup(server) {
      for (const tool of catalog) {
        server.registerTool(
          tool.name,
          {
            description: tool.description,
            annotations: tool.metadata.annotations,
            inputSchema: tool.inputSchema,
            outputSchema: tool.successSchema,
            scopeChallenge: () =>
              actor.scopes.includes(tool.scope)
                ? undefined
                : {
                    scopes: [
                      tool.scope,
                      ...mcpScopes.filter((scope) => actor.scopes.includes(scope)),
                    ],
                  },
          },
          async (input) => {
            const result = await tool.execute(input);
            return {
              isError: result.status !== "ok",
              structuredContent: result,
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          },
        );
      }
    },
  });
};
