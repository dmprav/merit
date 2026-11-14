import type { GrantmakingQueries } from "@merit/grantmaking/api";

export type GrantmakingOperations = Pick<
  GrantmakingQueries,
  | "listRoundSummaries"
  | "readRound"
  | "listApplications"
  | "readApplication"
  | "listReviews"
  | "roundContent"
  | "applicationContent"
  | "roundHistory"
  | "applicationHistory"
  | "listWorkspaceActivity"
>;
