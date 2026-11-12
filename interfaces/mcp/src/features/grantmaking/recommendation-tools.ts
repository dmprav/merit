import { publicIdSchema } from "@merit/grantmaking/api";
import { saveRecommendationRequestSchema } from "@merit/recommendations/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { FundingRoundOperations } from "./operations";
import { savedRecommendationSchema, presentRecommendation } from "./responses";
import { write, revision } from "./tool-options";

export const registerRecommendationTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: Pick<FundingRoundOperations, "saveRecommendation">,
) => {
  register(
    "save_recommendation",
    {
      ...write,
      description:
        "Save a requested manager recommendation, not a funding decision. Use recommendationRevision and applicationVersion from get_application. Exact allocations use EUR minor-unit strings. Attribution is assigned by Merit.",
      inputSchema: saveRecommendationRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ applicationId: publicIdSchema, expectedRecommendationRevision: revision }),
      outputSchema: savedRecommendationSchema,
    },
    async ({ applicationId, expectedRecommendationRevision, ...input }) =>
      presentRecommendation(
        await workspace.saveRecommendation(actor, {
          ...input,
          publicId: applicationId,
          expectedRevision: expectedRecommendationRevision,
        }),
        applicationId,
      ),
  );
};
