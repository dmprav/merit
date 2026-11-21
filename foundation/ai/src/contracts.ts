import { z } from "zod";

export const writeErrorSchema = z.union([
  z.object({ status: z.enum(["not_found", "conflict"]) }),
  z.object({ status: z.literal("invalid"), error: z.string().min(1) }),
]);

export const revision = z.number().int().nonnegative();
