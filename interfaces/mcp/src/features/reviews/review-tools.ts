import { publicIdSchema } from "@merit/grantmaking/api";
import { saveReviewRequestSchema, type ReviewService } from "@merit/reviews/api";
import { reviewChanges } from "@merit/reviews/domain";

import type { RegisterTool } from "../../components/register-tool";
import { grantWriteOptions, revision } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import { reviewSavedSchema } from "./responses";

export const registerManagerReviewTools = (
  register: RegisterTool,
  actor: McpActor,
  reviews: ReviewService,
) => {
  const reviewBase = saveReviewRequestSchema
    .omit({ publicId: true, expectedRevision: true, change: true })
    .extend({ applicationId: publicIdSchema, expectedReviewRevision: revision });
  const reviewCommands = [
    [
      "request_review",
      "Record a review request. Sends no notifications. Reuse id on retry.",
      reviewChanges.request,
    ],
    [
      "cancel_review_request",
      "Cancel an outstanding review request; retain its history.",
      reviewChanges.cancel,
    ],
    [
      "record_assessment",
      "Record an assessment received outside Merit, including its actual evidence bases. Unknown bases stay unknown. Attach observations with criterionId from the round criteria history when known; otherwise use null. Retain received labels and notes for removed criteria. Reuse id on retry.",
      reviewChanges.record,
    ],
    [
      "correct_assessment",
      "Correct a recorded assessment with an explanation, preserving its previous version and attribution.",
      reviewChanges.edit,
    ],
  ] as const;
  for (const [name, description, change] of reviewCommands) {
    const { action, ...fieldsSchema } = change.shape;
    register(
      name,
      {
        ...grantWriteOptions,
        description,
        inputSchema: reviewBase.extend(fieldsSchema),
        outputSchema: reviewSavedSchema,
      },
      async ({
        applicationId,
        expectedReviewRevision,
        workspaceSlug,
        expectedApplicationVersion,
        expectedCriteriaVersion,
        ...fields
      }) => {
        const command = saveReviewRequestSchema.parse({
          workspaceSlug,
          publicId: applicationId,
          expectedRevision: expectedReviewRevision,
          expectedApplicationVersion,
          expectedCriteriaVersion,
          change: { ...fields, action: action.value },
        });
        const result = await reviews.saveReview(actor, command);
        return result.status === "ok"
          ? { status: "ok" as const, applicationId, reviewRevision: result.revision }
          : result;
      },
    );
  }
};
