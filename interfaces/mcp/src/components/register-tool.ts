import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { z } from "zod";

import { mcpScopes, type McpActor, type McpScope } from "../contracts";

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

const boundaryErrorSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("insufficient_scope"), requiredScope: z.enum(mcpScopes) }),
  z.object({ status: z.literal("unavailable"), message: z.string(), diagnosticId: z.uuid() }),
]);

const presentResult = (data: { status: string }) => {
  return {
    isError: data.status !== "ok",
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
};

export const createToolRegistrar =
  (server: McpServer, actor: McpActor) =>
  <
    I,
    O extends z.ZodType<{ status: "ok" }> & StandardSchemaWithJSON,
    E extends z.ZodType<{ status: string }>,
  >(
    name: string,
    definition: {
      description: string;
      inputSchema: z.ZodType<I> & StandardSchemaWithJSON;
      outputSchema: O;
      errorSchema: E;
      scope: McpScope;
      annotations: ToolAnnotations;
    },
    operation: (input: I) => Promise<NoInfer<z.output<O> | z.output<E>>>,
  ) => {
    const { scope, errorSchema, ...config } = definition;
    const resultSchema = z.union([config.outputSchema, errorSchema, boundaryErrorSchema]);
    server.registerTool(
      name,
      {
        ...config,
        scopeChallenge: () =>
          actor.scopes.includes(scope)
            ? undefined
            : {
                scopes: [
                  scope,
                  ...mcpScopes.filter((value) => value !== scope && actor.scopes.includes(value)),
                ],
              },
      },
      async (input) => {
        let stage = "operation";
        try {
          const result = actor.scopes.includes(scope)
            ? await operation(config.inputSchema.parse(input))
            : { status: "insufficient_scope", requiredScope: scope };
          stage = "response";
          return presentResult(resultSchema.parse(result));
        } catch {
          const diagnosticId = crypto.randomUUID();
          console.error("Workspace MCP operation failed.", { tool: name, stage, diagnosticId });
          return presentResult(
            boundaryErrorSchema.parse({
              status: "unavailable",
              message:
                "The operation could not complete. Read the current state before retrying a write.",
              diagnosticId,
            }),
          );
        }
      },
    );
  };

export type RegisterTool = ReturnType<typeof createToolRegistrar>;
