import type { GrantmakingService } from "@merit/grantmaking/api";

export type FundingRoundOperations = Pick<
  GrantmakingService,
  | "listReviews"
  | "saveReview"
  | "selectContact"
  | "createApplication"
  | "editApplication"
  | "createRound"
  | "editRound"
  | "deleteRound"
  | "readApplication"
  | "readRound"
  | "listApplications"
  | "roundContent"
  | "applicationContent"
  | "roundHistory"
  | "applicationHistory"
  | "listWorkspaceActivity"
  | "saveRecommendation"
> & {
  listRounds: GrantmakingService["listRoundSummaries"];
};
