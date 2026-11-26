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
        "Save a funding proposal attributed to the manager. When asked to adopt a reviewer’s proposal if it uses current evidence, check freshness in list_application_reviews. If current, pass the selected summary’s id and assessmentVersion as expectedCurrentAssessment {id, version}, save its funding position and exact amount as the manager’s recommendation, and cite the reviewer’s finding. Merit checks that version and its freshness again when saving. A recommendation is a proposal and commits no funds. To record a decision the committee made, use record_committee_decision instead; do not enter it as a recommendation or reviewer assessment. Use recommendationRevision and applicationVersion from get_application. Exact allocations use EUR minor-unit strings. Merit assigns attribution and the recording date. Confirm the save with the date returned in recommendation.recorded.date.",
      inputSchema: saveRecommendationRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({
          applicationId: publicIdSchema,
          expectedRecommendationRevision: revision,
        }),
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
