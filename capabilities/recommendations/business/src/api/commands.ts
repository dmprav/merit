import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";

import { recommendationDataSchema } from "../domain/encoding";

export const saveRecommendationRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  expectedApplicationVersion: z.number().int().positive(),
  recommendation: recommendationDataSchema,
});

export type SaveRecommendationRequest = z.infer<typeof saveRecommendationRequestSchema>;
