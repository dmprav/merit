import { publicIdSchema } from "@merit/db/identifiers";
import {
  encodeRecommendationResult,
  savedRecommendationDataSchema,
  type RecommendationsService,
} from "@merit/recommendations/api";

export const savedRecommendationSchema = savedRecommendationDataSchema
  .omit({ recommendationVersion: true })
  .extend({
    applicationId: publicIdSchema,
    recommendationRevision: savedRecommendationDataSchema.shape.recommendationVersion,
  });

export const presentRecommendation = (
  result: Awaited<ReturnType<RecommendationsService["saveRecommendation"]>>,
  applicationId: string,
) => {
  const encoded = encodeRecommendationResult(result);
  if (encoded.status !== "ok") {
    return encoded;
  }
  const { recommendationVersion, ...saved } = encoded;
  return { ...saved, applicationId, recommendationRevision: recommendationVersion };
};
