import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { moneyDataSchema } from "@merit/money";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { reviewBasisComparisonSchema } from "@merit/reviews/domain";
import { reviewerStatuses } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

const recordId = z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/);
export const roundReadInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  roundId: recordId,
});
export const applicationReadInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  applicationId: recordId,
});
export const roundListInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  after: recordId.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const applicationListInput = roundListInput.extend({ roundId: recordId });
const contentRange = {
  offset: z.number().int().min(0).max(2147483646).default(0),
  length: z.number().int().min(1).max(8000).default(8000),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
};
export const roundContentInput = roundReadInput.extend({
  section: z.enum(["details", "criteria", "criteria_history", "preparation_change"]),
  revision: z.number().int().nonnegative().optional(),
  ...contentRange,
});
export const applicationContentInput = applicationReadInput.extend({
  section: z.enum([
    "details",
    "submission",
    "material",
    "evidence",
    "reviews",
    "assessment",
    "review_request",
    "working_revision",
    "recommendation",
    "intake_change",
    "recommendation_change",
  ]),
  entryId: z.string().min(1).max(100).optional(),
  materialVersion: materialVersionSchema.optional(),
  revision: z.number().int().nonnegative().optional(),
  ...contentRange,
});
export const roundHistoryInput = roundReadInput.extend({
  afterRevision: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const applicationHistoryInput = applicationReadInput.extend({
  history: z.enum(["intake", "recommendation"]),
  afterRevision: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const roundSummarySchema = z.object({
  roundId: recordId,
  title: z.string(),
  preparationRevision: z.number().int().nonnegative(),
  criteriaVersion: criteriaVersionSchema,
  budget: moneyDataSchema.nullable(),
  applicationCount: z.number().int().nonnegative(),
});
export const applicationSummarySchema = z.object({
  applicationId: recordId,
  roundId: recordId.nullable(),
  title: z.string(),
  applicationVersion: materialVersionSchema,
  intakeRevision: z.number().int().nonnegative(),
  reviewRevision: reviewRevisionSchema,
  recommendationRevision: z.number().int().nonnegative(),
  intakeStatus: z.enum(["in_preparation", "ready"]),
  requested: moneyDataSchema.nullable(),
  contactId: z.string().nullable(),
  hasWorkingRevision: z.boolean(),
});
export const roundOverviewSchema = roundSummarySchema.extend({
  managerUserId: z.string().nullable(),
  managerNeedsReassignment: z.boolean(),
  totals: z.object({
    requested: moneyDataSchema,
    unknownRequests: z.number().int().nonnegative(),
    proposed: moneyDataSchema,
    remaining: moneyDataSchema.nullable(),
  }),
});
export const applicationContextSchema = applicationSummarySchema.extend({
  criteriaVersion: criteriaVersionSchema.nullable(),
  roundPreparationRevision: z.number().int().nonnegative().nullable(),
  lastIntakeRevision: z.number().int().nonnegative(),
  lastRecommendationRevision: z.number().int().nonnegative(),
});
export const contentChunkSchema = z.object({
  status: z.literal("ok"),
  format: z.literal("json"),
  content: z.string().max(16000),
  fingerprint: z.string(),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  totalCharacters: z.number().int().nonnegative(),
});
export const historySummarySchema = z.object({
  revision: z.number().int().nonnegative(),
  action: z.string(),
  recordedAt: z.string(),
});
export const readingErrorSchema = z.object({
  status: z.enum(["not_found", "forbidden", "conflict", "invalid_range", "invalid"]),
});

export const contactApplicationListInput = roundListInput.extend({ contactId: z.uuid() });

export const reviewListInput = applicationReadInput.extend({
  after: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const reviewSummarySchema = z.object({
  basisComparison: reviewBasisComparisonSchema,
  authorUserId: z.string().optional(),
  participation: z.object({ status: z.enum(reviewerStatuses), conflict: z.boolean() }).optional(),
  id: z.string(),
  kind: z.enum(["assessment", "request"]),
  contactId: z.string(),
  reviewer: z.string(),
  applicationVersion: materialVersionSchema,
  criteriaVersion: criteriaVersionSchema.nullable(),
  reviewRevision: reviewRevisionSchema,
  recordedApplicationVersion: materialVersionSchema.nullable(),
  recordedCriteriaVersion: criteriaVersionSchema.nullable(),
  freshness: z.enum(["current", "outdated", "outstanding", "unknown"]),
});
