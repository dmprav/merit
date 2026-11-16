import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { reviewChangeSchema, type ReviewChangeError } from "../../domain/reviews";
import { reviewRevisionSchema } from "../../domain/versions";

export type ReviewSaveError = ReviewChangeError | "invalid_review";

const workspace = z.strictObject({ workspaceSlug: workspaceSlugSchema });
export const saveReviewRequestSchema = workspace.extend({
  publicId: publicIdSchema,
  expectedRevision: reviewRevisionSchema,
  expectedApplicationVersion: materialVersionSchema,
  expectedCriteriaVersion: criteriaVersionSchema,
  change: reviewChangeSchema,
});

export type SaveReviewRequest = z.infer<typeof saveReviewRequestSchema>;
