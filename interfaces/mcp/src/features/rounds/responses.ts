import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";

export const roundCreatedSchema = z.object({ status: z.literal("ok"), roundId: publicIdSchema });
export const roundSavedSchema = z.object({
  status: z.literal("ok"),
  roundId: publicIdSchema,
  preparationRevision: z.number().int().nonnegative(),
});
