import { publicIdSchema } from "@merit/grantmaking/api";
import { saveReviewRequestSchema } from "@merit/reviews/api";
import { reviewChanges } from "@merit/reviews/domain";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { FundingRoundOperations } from "./operations";
import { reviewSavedSchema } from "./responses";
import { write, revision } from "./tool-options";

export const registerReviewTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: Pick<FundingRoundOperations, "saveReview">,
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
        ...write,
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
        const result = await workspace.saveReview(actor, command);
        return result.status === "ok"
          ? { status: "ok" as const, applicationId, reviewRevision: result.revision }
          : result;
      },
    );
  }
};
