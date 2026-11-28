import type { IntakeData } from "@merit/applications-web/contracts";
import type { DecisionData } from "@merit/decisions-web/contracts";
import type { RoundSummary } from "@merit/grantmaking/api";
import type {
  ApplicationView as Application,
  ApplicationRoundContext,
  RoundPage,
} from "@merit/grantmaking/api";
import type { RecommendationData } from "@merit/recommendations-web/contracts";
import type { ReviewData } from "@merit/reviews-web/contracts";
import type { AiReviewData } from "@merit/reviews-web/contracts/ai-review";
import type { PreparationData } from "@merit/rounds-web/contracts";

import type { ApplicationList } from "./application-list";
import type { CreationData } from "./creation";

export type ApplicationData = {
  round: ApplicationRoundContext;
  application: Application;
  key: string;
  recommendation: RecommendationData;
  decision: DecisionData;
  reviews: ReviewData | null;
  aiReview: AiReviewData | null;
  intake: IntakeData | null;
};

export type RoundData = {
  applicationList: ApplicationList;
  round: RoundPage;
  preparation: PreparationData | null;
  createApplication: CreationData | null;
};

export type RoundsData = {
  rounds: readonly RoundSummary[];
  createRound: CreationData | null;
};

export type ActivityFilters = { roundId: string; personId: string };
