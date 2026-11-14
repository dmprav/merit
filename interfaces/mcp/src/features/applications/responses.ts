import { z } from "zod";

import { publicIdSchema } from "@merit/grantmaking/api";

export const applicationCreatedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
});
export const applicationSavedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  intakeRevision: z.number().int().nonnegative(),
});
