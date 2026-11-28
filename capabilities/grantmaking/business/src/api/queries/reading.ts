import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { auditPageInput } from "@merit/audit/api";
import { publicIdSchema } from "@merit/db/identifiers";
import { decisionVersionDataSchema } from "@merit/decisions/api";
import { moneyDataSchema } from "@merit/money";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { reviewIdSchema, reviewRevisionSchema } from "@merit/reviews/domain";
import { reviewBasisComparisonSchema } from "@merit/reviews/domain";
import { reviewerStatuses } from "@merit/reviews/domain";
import { criteriaVersionSchema, roundBudgetChangeSchema } from "@merit/rounds/domain";

export const roundReadInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  roundId: publicIdSchema,
});
export const applicationReadInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  applicationId: publicIdSchema,
});
export const roundListInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  after: publicIdSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const applicationListInput = roundListInput.extend({ roundId: publicIdSchema });
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
  criteriaVersion: criteriaVersionSchema.optional(),
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
    "decision",
    "intake_change",
    "recommendation_change",
    "decision_change",
  ]),
  entryId: reviewIdSchema.optional(),
  materialVersion: materialVersionSchema
    .optional()
    .describe(
      "Required for section material. The first snapshot is 1. Read later versions in ascending order to find when wording first appeared.",
    ),
  revision: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Audit revision for intake_change, recommendation_change, or decision_change."),
  ...contentRange,
});
export const roundHistoryInput = roundReadInput.extend({
  afterRevision: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const applicationHistoryInput = applicationReadInput.extend({
  history: z.enum(["intake", "recommendation", "decision"]),
  afterRevision: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const roundSummarySchema = z.object({
  roundId: publicIdSchema,
  title: z.string(),
  preparationRevision: z.number().int().nonnegative(),
  criteriaVersion: criteriaVersionSchema,
  budget: moneyDataSchema.nullable(),
  applicationCount: z.number().int().nonnegative(),
});
export const roundListPageSchema = z.object({
  status: z.literal("ok"),
  rounds: z.array(roundSummarySchema),
  nextCursor: publicIdSchema.nullable(),
});
export const applicationSummarySchema = z.object({
  applicationId: publicIdSchema,
  roundId: publicIdSchema,
  title: z.string(),
  applicationVersion: materialVersionSchema,
  intakeRevision: z.number().int().nonnegative(),
  reviewRevision: reviewRevisionSchema,
  recommendationRevision: z.number().int().nonnegative(),
  decisionRevision: z.number().int().nonnegative(),
  intakeStatus: z.enum(["in_preparation", "ready"]),
  withdrawn: z.boolean(),
  requested: moneyDataSchema.nullable(),
  contactId: z.string().nullable(),
  hasWorkingRevision: z.boolean(),
});
export const contactApplicationSummarySchema = applicationSummarySchema.extend({
  roundTitle: z.string(),
  relationships: z
    .array(z.enum(["applicant_contact", "review_requested", "assessment_recorded"]))
    .min(1),
});
export const roundOverviewSchema = roundSummarySchema.extend({
  managerUserId: z.string().nullable(),
  managerNeedsReassignment: z.boolean(),
  totals: z.object({
    requested: moneyDataSchema,
    unknownRequests: z.number().int().nonnegative(),
    withdrawnApplications: z.number().int().nonnegative(),
    proposed: moneyDataSchema,
    remaining: moneyDataSchema.nullable(),
    committed: moneyDataSchema,
    available: moneyDataSchema.nullable(),
  }),
});
export const applicationContextSchema = applicationSummarySchema.extend({
  requestedDisplay: z.string().nullable(),
  criteriaVersion: criteriaVersionSchema,
  roundPreparationRevision: z.number().int().nonnegative(),
  lastIntakeRevision: z.number().int().nonnegative(),
  lastRecommendationRevision: z.number().int().nonnegative(),
  /** The current committee decision with its revision and recorder; null before one is recorded. */
  decision: decisionVersionDataSchema.nullable(),
});
export const contentChunkSchema = z.object({
  status: z.literal("ok"),
  format: z.literal("json"),
  fingerprint: z.string(),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  totalCharacters: z.number().int().nonnegative(),
  content: z.string().max(16000),
});
export const historySummarySchema = z.object({
  revision: z.number().int().nonnegative(),
  action: z.string(),
  recordedAt: z.string(),
});
export const roundHistorySummarySchema = historySummarySchema.extend({
  budgetChange: roundBudgetChangeSchema.nullable(),
});
export const roundHistoryPageSchema = z.object({
  status: z.literal("ok"),
  entries: z.array(roundHistorySummarySchema),
  nextRevision: z.number().int().nonnegative().nullable(),
});
export const readingErrorSchema = z.object({
  status: z.enum(["not_found", "forbidden", "conflict", "invalid_range", "invalid"]),
});

export const contactApplicationListInput = roundListInput.extend({ contactId: z.uuid() });

const reviewKind = z.enum(["assessment", "request"]);
const reviewCursor: z.ZodType<string, string> = z.templateLiteral([reviewKind, ":", z.uuid()]);

export const reviewListInput = applicationReadInput.extend({
  after: reviewCursor.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const reviewSummarySchema = z.object({
  basisComparison: reviewBasisComparisonSchema,
  authorUserId: z.string().optional(),
  participation: z.object({ status: z.enum(reviewerStatuses), conflict: z.boolean() }).optional(),
  id: reviewIdSchema,
  kind: reviewKind,
  contactId: z.string(),
  reviewer: z.string(),
  applicationVersion: materialVersionSchema,
  criteriaVersion: criteriaVersionSchema,
  reviewRevision: reviewRevisionSchema,
  assessmentVersion: z.number().int().positive().nullable(),
  recordedApplicationVersion: materialVersionSchema.nullable(),
  recordedCriteriaVersion: criteriaVersionSchema.nullable(),
  freshness: z.enum(["current", "outdated", "outstanding", "unknown"]),
});

export const applicationAuditInput = applicationReadInput.extend(auditPageInput.shape);
export const roundBudgetHistoryInput = roundReadInput.extend(auditPageInput.shape);
