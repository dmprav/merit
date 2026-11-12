import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

import { publicIdSchema } from "./identifiers";

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
  roundSummarySchema,
  applicationSummarySchema,
  roundOverviewSchema,
  applicationContextSchema,
  contentChunkSchema,
  historySummarySchema,
  readingErrorSchema,
} from "./queries/reading";

export { contactApplicationListInput } from "./queries/reading";

export { reviewListInput, reviewSummarySchema } from "./queries/reading";

export { roundView, applicationView, decodeRoundView } from "./queries/round-view";
export type { RoundView, ApplicationView, ApplicationRoundContext } from "./queries/round-view";
export { updateRecommendation } from "./queries/recommendation-preview";
export {
  encodeApplicationDetail,
  decodeApplicationDetail,
  encodeBudgetTotals,
  totalsDataSchema,
} from "./queries/application-detail";
export { encodeRoundSummary, decodeRoundSummary } from "./queries/round-summary";
export type { RoundSummary } from "./queries/round-summary";
export type { IntakeState, PreparationState } from "./queries/editing-state";

export {
  applicationOverviewSchema,
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
