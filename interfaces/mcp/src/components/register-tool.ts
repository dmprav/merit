import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { z } from "zod";

import { recordSafeError, setSpanAttributes, withSpan, type Span } from "@merit/telemetry";

import { mcpScopes, type McpActor, type McpScope } from "../contracts";

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

const boundaryErrorSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("insufficient_scope"), requiredScope: z.enum(mcpScopes) }),
  z.object({ status: z.literal("invalid_input"), message: z.string() }),
  z.object({ status: z.literal("unavailable"), message: z.string(), diagnosticId: z.uuid() }),
]);

const presentResult = (data: { status: string }) => {
  return {
    isError: data.status !== "ok",
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
};

const unavailableError = (diagnosticId: string) =>
  boundaryErrorSchema.parse({
    status: "unavailable",
    message: "The operation could not complete. Read the current state before retrying a write.",
    diagnosticId,
  });

const runRegisteredTool = async <I>(
  span: Span,
  name: string,
  scope: McpScope,
  actor: McpActor,
  inputSchema: z.ZodType<I>,
  resultSchema: z.ZodType<{ status: string }>,
  operation: (input: I) => Promise<unknown>,
  input: unknown,
) => {
  if (!actor.scopes.includes(scope)) {
    span.setAttribute("merit.outcome", "insufficient_scope");
    return presentResult(
      boundaryErrorSchema.parse({ status: "insufficient_scope", requiredScope: scope }),
    );
  }

  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    span.setAttribute("merit.outcome", "invalid_input");
    return presentResult(
      boundaryErrorSchema.parse({ status: "invalid_input", message: "Invalid input." }),
    );
  }

  let result: unknown;
  try {
    result = await operation(parsedInput.data);
  } catch (error) {
    const diagnosticId = crypto.randomUUID();
    recordSafeError(span, error);
    setSpanAttributes(span, {
      "merit.outcome": "unavailable",
      "merit.diagnostic_id": diagnosticId,
    });
    console.error("Workspace MCP operation failed.", {
      tool: name,
      stage: "operation",
      diagnosticId,
      error: error instanceof Error ? error.message : String(error),
    });
    return presentResult(unavailableError(diagnosticId));
  }

  const parsedResult = resultSchema.safeParse(result);
  if (!parsedResult.success) {
    const diagnosticId = crypto.randomUUID();
    setSpanAttributes(span, {
      "merit.outcome": "unavailable",
      "merit.diagnostic_id": diagnosticId,
    });
    console.error("Workspace MCP operation failed.", {
      tool: name,
      stage: "response",
      diagnosticId,
    });
    return presentResult(unavailableError(diagnosticId));
  }

  span.setAttribute("merit.outcome", parsedResult.data.status);
  return presentResult(parsedResult.data);
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
      (input) =>
        withSpan(
          `mcp.tool.${name}`,
          (span) =>
            runRegisteredTool(
              span,
              name,
              scope,
              actor,
              config.inputSchema,
              resultSchema,
              operation,
              input,
            ),
          {
            attributes: {
              "mcp.tool.name": name,
              "mcp.scope": scope,
              "mcp.client.id": actor.provenance.clientId,
            },
          },
        ),
    );
  };

export type RegisterTool = ReturnType<typeof createToolRegistrar>;
