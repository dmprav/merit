import { z } from "zod";

import { applicationMaterialDataSchema } from "@merit/applications/api";
import {
  reviewerDraftSchema,
  reviewerStatuses,
  reviewBasisComparisonSchema,
  reviewCriteriaSchema,
  reviewStateSchema,
} from "@merit/reviews/domain";

export const reviewerErrorSchema = z.object({
  status: z.enum(["not_found", "forbidden", "conflict", "invalid", "expired", "limited"]),
});
const reviewerSummarySchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  revision: z.number().int().nonnegative(),
  status: z.enum(reviewerStatuses),
  reviewer: z.string(),
  hasSubmitted: z.boolean(),
  email: z.string(),
  applicationTitle: z.string(),
  applicant: z.string(),
  organization: z.string(),
  dueDate: z.string().nullable(),
  managerName: z.string(),
  managerEmail: z.string(),
  applicationVersion: z.number().int(),
  criteriaVersion: z.number().int(),
  basisComparison: reviewBasisComparisonSchema,
  materialChanged: z.boolean(),
  criteriaChanged: z.boolean(),
  conflict: z.string(),
  delivery: z.enum(["pending", "sent", "failed"]),
  notification: z.enum(["pending", "sent", "failed"]).nullable(),
  expiresAt: z.string(),
});
export const reviewerSavedSchema = z.object({
  status: z.literal("ok"),
  value: reviewerSummarySchema,
});
export const reviewerListSchema = z.object({
  status: z.literal("ok"),
  items: z.array(reviewerSummarySchema),
  nextCursor: z.string().nullable(),
});
export const applicationReviewersSchema = reviewerListSchema;
export const reviewerHistorySchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    entries: z.array(
      z.object({
        action: z.string(),
        actor: z.string().nullable(),
        at: z.string(),
        note: z.string(),
      }),
    ),
    nextCursor: z.string().nullable(),
  }),
});
export const reviewerPageSchema = z.object({
  status: z.literal("ok"),
  value: z.object({
    assignment: reviewerSummarySchema,
    material: applicationMaterialDataSchema.nullable(),
    criteria: reviewCriteriaSchema.nullable(),
    draft: z
      .object({ revision: z.number().int().nonnegative(), content: reviewerDraftSchema })
      .nullable(),
    assessment: reviewStateSchema.shape.assessments.element.nullable(),
  }),
});
export const reviewerRevisionSchema = z.object({
  status: z.literal("ok"),
  value: z.object({ revision: z.number().int().nonnegative() }),
});
