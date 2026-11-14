import { publicIdSchema } from "@merit/grantmaking/api";
import {
  saveRecommendationRequestSchema,
  type RecommendationsService,
} from "@merit/recommendations/api";

import type { RegisterTool } from "../../components/register-tool";
import { grantWriteOptions, revision } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import { savedRecommendationSchema, presentRecommendation } from "./responses";

export const registerRecommendationTools = (
  register: RegisterTool,
  actor: McpActor,
  recommendations: RecommendationsService,
) => {
  register(
    "save_recommendation",
    {
      ...grantWriteOptions,
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
  );
};
