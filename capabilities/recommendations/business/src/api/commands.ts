import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

import { recommendationDataSchema } from "./encoding";

const publicIdSchema = z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/);

export const saveRecommendationRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  expectedApplicationVersion: z.number().int().positive(),
  recommendation: recommendationDataSchema,
});

export type SaveRecommendationRequest = z.infer<typeof saveRecommendationRequestSchema>;
