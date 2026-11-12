import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { reviewChangeSchema, type ReviewChangeError } from "../../domain/reviews";
import { reviewRevisionSchema } from "../../domain/versions";

export type ReviewSaveError = ReviewChangeError | "invalid_review";

const workspace = z.strictObject({ workspaceSlug: workspaceSlugSchema });
export const saveReviewRequestSchema = workspace.extend({
  publicId: z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/),
  expectedRevision: reviewRevisionSchema,
  expectedApplicationVersion: materialVersionSchema,
  expectedCriteriaVersion: criteriaVersionSchema,
  change: reviewChangeSchema,
});

export type SaveReviewRequest = z.infer<typeof saveReviewRequestSchema>;
