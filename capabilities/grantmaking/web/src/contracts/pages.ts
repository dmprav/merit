import type { IntakeData } from "@merit/applications-web/contracts";
import type { RoundSummary } from "@merit/grantmaking/api";
import type {
  ApplicationView as Application,
  ApplicationRoundContext,
  RoundView,
} from "@merit/grantmaking/api";
import type { RecommendationData } from "@merit/recommendations-web/contracts";
import type { ReviewData } from "@merit/reviews-web/contracts";
import type { PreparationData } from "@merit/rounds-web/contracts";

import type { CreationData } from "./creation";

export type ApplicationData = {
  round: ApplicationRoundContext;
  application: Application;
  key: string;
  recommendation: RecommendationData;
  reviews: ReviewData | null;
  intake: IntakeData | null;
};

export type RoundData = {
  round: RoundView;
  preparation: PreparationData | null;
  createApplication: CreationData | null;
};

export type RoundsData = {
  rounds: readonly RoundSummary[];
  createRound: CreationData | null;
};
