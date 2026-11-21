import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import type { Actor } from "@merit/auth";
import { recordSafeError, setSpanAttributes, withSpan, type Span } from "@merit/telemetry";

const boundaryErrorSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("invalid_input"), message: z.string() }),
  z.object({ status: z.literal("unavailable"), message: z.string(), diagnosticId: z.uuid() }),
]);

const unavailableError = (diagnosticId: string) =>
  boundaryErrorSchema.parse({
    status: "unavailable",
    message: "The operation could not complete. Read the current state before retrying a write.",
    diagnosticId,
  });

const runRegisteredTool = async <I, R extends { status: string }>(
  span: Span,
  name: string,
  inputSchema: z.ZodType<I>,
  resultSchema: z.ZodType<R>,
  operation: (input: I) => Promise<unknown>,
  input: unknown,
) => {
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    span.setAttribute("merit.outcome", "invalid_input");
    return boundaryErrorSchema.parse({ status: "invalid_input", message: "Invalid input." });
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
    console.error("Workspace tool failed.", {
      tool: name,
      stage: "operation",
      diagnosticId,
    });
    return unavailableError(diagnosticId);
  }

  const parsedResult = resultSchema.safeParse(result);
  if (!parsedResult.success) {
    const diagnosticId = crypto.randomUUID();
    setSpanAttributes(span, {
      "merit.outcome": "unavailable",
      "merit.diagnostic_id": diagnosticId,
    });
    console.error("Workspace tool failed.", {
      tool: name,
      stage: "response",
      diagnosticId,
    });
    return unavailableError(diagnosticId);
  }

  span.setAttribute("merit.outcome", parsedResult.data.status);
  return parsedResult.data;
};

type ToolContract<
  I,
  O extends z.ZodType<{ status: "ok" }>,
  E extends z.ZodType<{ status: string }>,
> = {
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: O;
  errorSchema: E;
};

export const defineActorTool = <
  Name extends string,
  I,
  O extends z.ZodType<{ status: "ok" }>,
  E extends z.ZodType<{ status: string }>,
>(
  actor: Actor,
  name: Name,
  contract: ToolContract<I, O, E>,
  operation: (input: I) => Promise<NoInfer<z.output<O> | z.output<E>>>,
) => {
  const { description, inputSchema, errorSchema, outputSchema: successSchema } = contract;
  const outputSchema: z.ZodType<z.output<O> | z.output<E> | z.output<typeof boundaryErrorSchema>> =
    z.union([successSchema, boundaryErrorSchema, errorSchema]);

  const execute = (input: unknown) =>
    withSpan(
      `tool.${name}`,
      (span) => runRegisteredTool(span, name, inputSchema, outputSchema, operation, input),
      {
        attributes: {
          "merit.tool.name": name,
          ...(actor.provenance?.interface === "mcp" && {
            "mcp.client.id": actor.provenance.clientId,
          }),
        },
      },
    );

  return {
    ...toolDefinition({ name, description, inputSchema, outputSchema }).server(execute),
    execute,
    successSchema,
  };
};
