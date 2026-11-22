import { z } from "zod";

import { applicationMaterialDataSchema } from "@merit/applications/api";
import {
  reviewerDraftSchema,
  reviewerProblems,
  reviewerStatuses,
  reviewBasisComparisonSchema,
  reviewCriteriaSchema,
  reviewStateSchema,
} from "@merit/reviews/domain";

export const reviewerErrorSchema = z.object({
  status: z.enum(["not_found", "forbidden", "conflict", "invalid", "expired", "limited"]),
  error: z.enum(reviewerProblems).optional(),
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
  workspaceSlug: z.string(),
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
  assignment: reviewerSummarySchema,
});
export const reviewerListSchema = z.object({
  status: z.literal("ok"),
  assignments: z.array(reviewerSummarySchema),
  nextCursor: z.string().nullable(),
});
export const reviewerPageSchema = z.object({
  status: z.literal("ok"),
  assignment: reviewerSummarySchema,
  material: applicationMaterialDataSchema.nullable(),
  criteria: reviewCriteriaSchema.nullable(),
  draft: z
    .object({ revision: z.number().int().nonnegative(), content: reviewerDraftSchema })
    .nullable(),
  assessment: reviewStateSchema.shape.assessments.element.nullable(),
});
export const reviewerRevisionSchema = z.object({
  status: z.literal("ok"),
  draftRevision: z.number().int().nonnegative(),
});

export const pageInput = z.strictObject({
  after: z.string().min(1).max(254).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Existing authorized services return complete lists; paginate their visible results. */
export const pageItems = <T>(
  items: T[],
  input: z.infer<typeof pageInput>,
  key: (item: T) => string,
) => {
  const sorted = items
    .filter((item) => input.after === undefined || key(item) > input.after)
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const page = sorted.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: sorted.length > input.limit && last ? key(last) : null,
  };
};
