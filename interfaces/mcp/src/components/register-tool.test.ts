import type { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { actor } from "../../tests/client";
import { createToolRegistrar } from "./register-tool";

const setup = (scopes = actor.scopes) => {
  let registeredHandler: ((input: unknown) => Promise<unknown>) | undefined;
  const server = {
    registerTool: vi.fn(
      (_name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) => {
        registeredHandler = handler;
      },
    ),
  } as unknown as McpServer;
  const register = createToolRegistrar(server, { ...actor, scopes });
  const operation = vi.fn();

  register(
    "sample_tool",
    {
      description: "Sample tool",
      inputSchema: z.strictObject({ count: z.number().int().positive() }),
      outputSchema: z.object({ status: z.literal("ok"), count: z.number() }),
      errorSchema: z.object({ status: z.literal("not_found") }),
      scope: "workspace:read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    operation,
  );

  return { handler: registeredHandler!, operation };
};

describe("createToolRegistrar", () => {
  it("returns invalid_input instead of unavailable when input fails schema validation", async () => {
    const { handler, operation } = setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await handler({ count: -5, secret: "sensitive-payload" });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { status: "invalid_input", message: "Invalid input." },
      });
      expect(JSON.stringify(result)).not.toContain("sensitive-payload");
      expect(operation).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("logs operation error messages with diagnosticId without leaking them in the response", async () => {
    const { handler, operation } = setup();
    operation.mockRejectedValueOnce(new Error("database connection refused"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = (await handler({ count: 1 })) as {
        isError: boolean;
        structuredContent: { status: string; diagnosticId: string };
      };
      expect(result.isError).toBe(true);
      expect(result.structuredContent.status).toBe("unavailable");
      expect(JSON.stringify(result)).not.toContain("database connection refused");
      expect(log).toHaveBeenCalledExactlyOnceWith("Workspace MCP operation failed.", {
        tool: "sample_tool",
        stage: "operation",
        diagnosticId: result.structuredContent.diagnosticId,
        error: "database connection refused",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("logs non-Error thrown values safely with diagnosticId", async () => {
    const { handler, operation } = setup();
    operation.mockRejectedValueOnce("unexpected string failure");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = (await handler({ count: 1 })) as {
        isError: boolean;
        structuredContent: { status: string; diagnosticId: string };
      };
      expect(result.isError).toBe(true);
      expect(result.structuredContent.status).toBe("unavailable");
      expect(log).toHaveBeenCalledExactlyOnceWith("Workspace MCP operation failed.", {
        tool: "sample_tool",
        stage: "operation",
        diagnosticId: result.structuredContent.diagnosticId,
        error: "unexpected string failure",
      });
    } finally {
      log.mockRestore();
    }
  });
});
