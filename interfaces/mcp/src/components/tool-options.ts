import { z } from "zod";

export const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const grantWriteErrorSchema = z.union([
  z.object({ status: z.enum(["not_found", "conflict"]) }),
  z.object({ status: z.literal("invalid"), error: z.string().min(1) }),
]);

export const grantWriteOptions = {
  scope: "grants:write" as const,
  errorSchema: grantWriteErrorSchema,
  annotations: writeAnnotations,
};

export const revision = z.number().int().nonnegative();
