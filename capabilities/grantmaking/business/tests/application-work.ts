import type { ApplicationWork } from "@merit/applications/server/grant-work";
import {
  applicationDecisionWork,
  roundCommitments as decisionRoundCommitments,
} from "@merit/decisions/server/integrations";
import { applicationRecommendationWork } from "@merit/recommendations/server/integrations";
import { applicationReviewWork } from "@merit/reviews/server/integrations";

/** The downstream work application assembly supplies to Applications. */
export const applicationWork: ApplicationWork = {
  reviews: applicationReviewWork,
  recommendations: applicationRecommendationWork,
  decisions: applicationDecisionWork,
};

/** The committed funding assembly supplies to Rounds when a budget changes. */
export const roundCommitments = decisionRoundCommitments;
