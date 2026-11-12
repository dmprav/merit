import { z } from "zod";

import { grantWriteErrorSchema } from "./responses";

export const write = {
  scope: "grants:write" as const,
  errorSchema: grantWriteErrorSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};
export const revision = z.number().int().nonnegative();
