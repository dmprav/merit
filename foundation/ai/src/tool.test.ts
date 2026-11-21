import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { defineActorTool } from "./tool";

const setup = () => {
  const operation = vi.fn();

  const tool = defineActorTool(
    { userId: "manager" },
    "sample_tool",
    {
      description: "Sample tool",
      inputSchema: z.strictObject({ count: z.number().int().positive() }),
      outputSchema: z.object({ status: z.literal("ok"), count: z.number() }),
      errorSchema: z.object({ status: z.literal("not_found") }),
    },
    operation,
  );

  return { handler: tool.execute, operation };
};

describe("defineActorTool", () => {
  it("returns invalid_input instead of unavailable when input fails schema validation", async () => {
    const { handler, operation } = setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await handler({ count: -5, secret: "sensitive-payload" });
      expect(result).toMatchObject({
        status: "invalid_input",
        message: "Invalid input.",
      });
      expect(JSON.stringify(result)).not.toContain("sensitive-payload");
      expect(operation).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("returns the validated domain result directly to an in-app caller", async () => {
    const { handler, operation } = setup();
    operation.mockResolvedValueOnce({ status: "ok", count: 3, internal: "private" });
    expect(await handler({ count: 3 })).toEqual({ status: "ok", count: 3 });
    expect(operation).toHaveBeenCalledWith({ count: 3 });
  });

  it("correlates an operation failure without disclosing the exception message", async () => {
    const { handler, operation } = setup();
    operation.mockRejectedValueOnce(new Error("database connection refused"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handler({ count: 1 });
      const result = z
        .object({ status: z.literal("unavailable"), diagnosticId: z.uuid() })
        .parse(response);
      expect(result.status).toBe("unavailable");
      expect(JSON.stringify(response)).not.toContain("database connection refused");
      expect(log).toHaveBeenCalledExactlyOnceWith("Workspace tool failed.", {
        tool: "sample_tool",
        stage: "operation",
        diagnosticId: result.diagnosticId,
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
      const result = z
        .object({ status: z.literal("unavailable"), diagnosticId: z.uuid() })
        .parse(await handler({ count: 1 }));
      expect(result.status).toBe("unavailable");
      expect(log).toHaveBeenCalledExactlyOnceWith("Workspace tool failed.", {
        tool: "sample_tool",
        stage: "operation",
        diagnosticId: result.diagnosticId,
      });
    } finally {
      log.mockRestore();
    }
  });
});
