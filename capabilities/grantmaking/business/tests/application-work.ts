import type { ApplicationWork } from "@merit/applications/server/grant-work";
import { applicationRecommendationWork } from "@merit/recommendations/server/integrations";
import { applicationReviewWork } from "@merit/reviews/server/integrations";

/** The downstream work application assembly supplies to Applications. */
export const applicationWork: ApplicationWork = {
  reviews: applicationReviewWork,
  recommendations: applicationRecommendationWork,
};
