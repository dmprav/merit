import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";

export const publicRoundRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
  kind: z.literal("round"),
});

export type PublicRoundRequest = z.infer<typeof publicRoundRequestSchema>;

export const applicationRequestSchema = publicRoundRequestSchema.omit({ kind: true });

export type ApplicationRequest = z.infer<typeof applicationRequestSchema>;

export {
  roundReadInput,
  applicationReadInput,
  roundListInput,
  applicationListInput,
  roundContentInput,
  applicationContentInput,
  roundHistoryInput,
  applicationHistoryInput,
  roundListPageSchema,
  roundHistoryPageSchema,
  applicationSummarySchema,
  roundOverviewSchema,
  applicationContextSchema,
  contentChunkSchema,
  historySummarySchema,
  roundHistorySummarySchema,
  readingErrorSchema,
} from "./queries/reading";

export { contactApplicationListInput, contactApplicationSummarySchema } from "./queries/reading";

export { reviewListInput, reviewSummarySchema } from "./queries/reading";

export { roundView, applicationView, decodeRoundView } from "./queries/round-view";
export type { RoundView, ApplicationView, ApplicationRoundContext } from "./queries/round-view";
export { encodeRoundPage, decodeRoundPage, type RoundPage } from "./queries/round-page";
export { updateRecommendation } from "./queries/recommendation-preview";
export {
  encodeApplicationDetail,
  decodeApplicationDetail,
  encodeBudgetTotals,
  encodeRoundTotals,
  totalsDataSchema,
  roundTotalsDataSchema,
} from "./queries/application-detail";
export { encodeRoundSummary, decodeRoundSummary } from "./queries/round-summary";
export type { RoundSummary } from "./queries/round-summary";

export {
  applicationOverviewSchema,
  applicationFilters,
  workspaceApplicationsInput,
  workspaceApplicationsPageSize,
  type ApplicationFilter,
  type WorkspaceApplicationsInput,
  type WorkspaceApplicationsQuery,
  type WorkspaceApplicationsPage,
  type ApplicationOverview,
} from "./queries/application-overview";

export {
  workspaceActivityInput,
  workspaceActivitySchema,
  activityEntrySchema,
  type ActivityEntry,
  type ActivityPerson,
  type WorkspaceActivity,
} from "./queries/activity";

export { applicationAuditInput, roundBudgetHistoryInput } from "./queries/reading";

export {
  workspaceSearchInput,
  workspaceSearchSchema,
  workspaceSearchLimits,
  workspaceSearchQueryLimit,
  searchedRoundSchema,
  searchedApplicationSchema,
  matchQualitySchema,
  orderedSearchRecords,
  searchMatchRank,
  type SearchRecord,
  type MatchQuality,
  type SearchedRound,
  type SearchedApplication,
  type WorkspaceSearch,
} from "./queries/workspace-search";
