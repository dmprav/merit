import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";

export const reviewSavedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  reviewRevision: z.number().int().nonnegative(),
});

export const reviewerHistorySchema = z.object({
  status: z.literal("ok"),
  entries: z.array(
    z.object({
      action: z.string(),
      actor: z.string().nullable(),
      at: z.string(),
      note: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
