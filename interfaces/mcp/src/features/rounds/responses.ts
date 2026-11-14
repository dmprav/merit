import { z } from "zod";

import { publicIdSchema } from "@merit/grantmaking/api";

export const roundCreatedSchema = z.object({ status: z.literal("ok"), roundId: publicIdSchema });
export const roundSavedSchema = z.object({
  status: z.literal("ok"),
  roundId: publicIdSchema,
  preparationRevision: z.number().int().nonnegative(),
});
