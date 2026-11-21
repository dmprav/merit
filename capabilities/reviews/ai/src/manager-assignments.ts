import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";
import {
  type ReviewerService,
  reviewerHistoryInput,
  reviewerApplicationSchema,
  inviteReviewerSchema,
  manageReviewerSchema,
} from "@merit/reviews/api";

import {
  pageInput,
  pageItems,
  reviewerErrorSchema,
  reviewerListSchema,
  reviewerSavedSchema,
} from "./assignments";
import { reviewerHistorySchema } from "./responses";

export type ManagerAssignmentOperations = Pick<
  ReviewerService,
  "forApplication" | "history" | "invite" | "manage"
>;

const createManagerReviewerReads = (actor: Actor, reviewer: ManagerAssignmentOperations) => [
  defineActorTool(
    actor,
    "list_reviewer_history",
    {
      errorSchema: reviewerErrorSchema,
      inputSchema: reviewerHistoryInput
        .omit({ publicId: true })
        .extend({ applicationId: reviewerApplicationSchema.shape.publicId }),
      outputSchema: reviewerHistorySchema,
      description:
        "For program managers: read lifecycle and submitted-assessment events for one assignment, newest first. Follow nextCursor as after. Never includes private drafts.",
    },
    async ({ applicationId, ...input }) => {
      const result = await reviewer.history(actor, { ...input, publicId: applicationId });
      return result.status === "ok" ? { status: "ok" as const, ...result.value } : result;
    },
  ),
  defineActorTool(
    actor,
    "list_application_reviewers",
    {
      errorSchema: reviewerErrorSchema,
      inputSchema: reviewerApplicationSchema
        .omit({ publicId: true })
        .extend({ applicationId: reviewerApplicationSchema.shape.publicId, ...pageInput.shape }),
      outputSchema: reviewerListSchema,
      description:
        "For program managers: list invited application reviewer assignments, email delivery status, and assignment revision. Use list_application_reviews for received assessments, offline requests, and basis freshness, and list_reviewer_history for assignment lifecycle history. Never includes private drafts. Follow nextCursor as after.",
    },
    async ({ applicationId, workspaceSlug, ...pagination }) => {
      const result = await reviewer.forApplication(actor, {
        publicId: applicationId,
        workspaceSlug,
      });
      if (result.status !== "ok") {
        return result;
      }
      const { items: assignments, nextCursor } = pageItems(
        result.value,
        pagination,
        (item) => item.id,
      );
      return { status: "ok" as const, assignments, nextCursor };
    },
  ),
];

const createManagerAssignments = (actor: Actor, reviewer: ManagerAssignmentOperations) => [
  defineActorTool(
    actor,
    "invite_reviewer",
    {
      errorSchema: reviewerErrorSchema,
      inputSchema: inviteReviewerSchema
        .omit({ publicId: true })
        .extend({ applicationId: inviteReviewerSchema.shape.publicId }),
      outputSchema: reviewerSavedSchema,
      description:
        "Invite the contact on an existing review request to assess this application. Their email must match a current reviewer or program-manager membership. For a new member, ask a workspace owner or administrator to invite them through Members & access on the website first. This assignment invitation sends email and requires verified manager email and a standard workspace. Reuse commandId on retry. Inspect delivery after saving.",
    },
    async ({ applicationId, ...input }) => {
      const result = await reviewer.invite(actor, { ...input, publicId: applicationId });
      return result.status === "ok" ? { status: "ok" as const, assignment: result.value } : result;
    },
  ),
  defineActorTool(
    actor,
    "manage_reviewer_assignment",
    {
      errorSchema: reviewerErrorSchema,
      inputSchema: manageReviewerSchema
        .omit({ publicId: true })
        .extend({ applicationId: manageReviewerSchema.shape.publicId }),
      outputSchema: reviewerSavedSchema,
      description:
        "Manage an assignment: cancel ends access, reinstate restores it, clear_conflict requires a reason and renewed reviewer acceptance, resend retries the invitation, retry_notification retries submission notification. Preserve expectedRevision and commandId on retry.",
    },
    async ({ applicationId, ...input }) => {
      const result = await reviewer.manage(actor, { ...input, publicId: applicationId });
      return result.status === "ok" ? { status: "ok" as const, assignment: result.value } : result;
    },
  ),
];

export const createManagerAssignmentTools = (
  actor: Actor,
  reviewer: ManagerAssignmentOperations,
) => [...createManagerReviewerReads(actor, reviewer), ...createManagerAssignments(actor, reviewer)];
