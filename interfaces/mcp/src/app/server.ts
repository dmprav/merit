import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { createMCPServer } from "@tanstack/ai-mcp/server";

import { mcpScopes, type McpActor } from "../contracts";
import type { McpOperations } from "./operations";
import { createMcpCatalog } from "./tools";

type CaptureToolOutcome = (toolName: string, outcome: string) => void;

export type McpDependencies = McpOperations & { captureMcpToolFinished?: CaptureToolOutcome };

// The SDK validates arguments before calling the executor. Keep its advertised
// schema and rejection response while observing the same validation result.
const observeInput = (
  schema: StandardSchemaWithJSON,
  rejected: () => void,
): StandardSchemaWithJSON => ({
  "~standard": {
    ...schema["~standard"],
    async validate(value, options) {
      const result = await schema["~standard"].validate(value, options);
      if (result.issues?.length) {
        rejected();
      }
      return result;
    },
  },
});

const reportOutcome = (capture: CaptureToolOutcome | undefined, name: string, outcome: string) => {
  try {
    capture?.(name, outcome);
  } catch {
    // Analytics delivery must never change the tool result.
  }
};

export const createWorkspaceServer = (
  actor: McpActor,
  operations: McpDependencies,
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
        const finished = (outcome: string) =>
          reportOutcome(operations.captureMcpToolFinished, tool.name, outcome);

        server.registerTool(
          tool.name,
          {
            description: tool.description,
            annotations: tool.metadata.annotations,
            inputSchema:
              operations.captureMcpToolFinished && tool.inputSchema
                ? observeInput(tool.inputSchema, () => finished("invalid_input"))
                : tool.inputSchema,
            outputSchema: tool.successSchema,
            scopeChallenge: () => {
              if (actor.scopes.includes(tool.scope)) {
                return undefined;
              }
              finished("insufficient_scope");
              return {
                scopes: [tool.scope, ...mcpScopes.filter((scope) => actor.scopes.includes(scope))],
              };
            },
          },
          async (input) => {
            const result = await tool.execute(input);
            finished(result.status);
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
