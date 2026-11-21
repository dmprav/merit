import { defineActorTool } from "@merit/ai";
import { writeErrorSchema, revision } from "@merit/ai/contracts";
import type { Actor } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import {
  saveRecommendationRequestSchema,
  type RecommendationsService,
} from "@merit/recommendations/api";

import { savedRecommendationSchema, presentRecommendation } from "./responses";

export const createRecommendationTools = (
  actor: Actor,
  recommendations: RecommendationsService,
) => [
  defineActorTool(
    actor,
    "save_recommendation",
    {
      errorSchema: writeErrorSchema,
      description:
        "Save a requested manager recommendation, not a funding decision. Use recommendationRevision and applicationVersion from get_application. Exact allocations use EUR minor-unit strings. Attribution is assigned by Merit.",
      inputSchema: saveRecommendationRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ applicationId: publicIdSchema, expectedRecommendationRevision: revision }),
      outputSchema: savedRecommendationSchema,
    },
    async ({ applicationId, expectedRecommendationRevision, ...input }) =>
      presentRecommendation(
        await recommendations.saveRecommendation(actor, {
          ...input,
          publicId: applicationId,
          expectedRevision: expectedRecommendationRevision,
        }),
        applicationId,
      ),
  ),
];
