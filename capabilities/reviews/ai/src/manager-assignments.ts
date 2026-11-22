import { defineActorTool } from "@merit/ai";
import { cursorPage } from "@merit/ai/contracts";
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
  pageAssignments,
  reviewerErrorSchema,
  reviewerListSchema,
  reviewerSavedSchema,
} from "./assignments";
import { reviewerHistorySchema } from "./responses";

export type ManagerAssignmentOperations = Pick<
  ReviewerService,
  "forApplication" | "history" | "invite" | "manage"
>;

const historyInput = reviewerHistoryInput
  .omit({ publicId: true })
  .extend({ applicationId: reviewerApplicationSchema.shape.publicId });
const reviewersInput = reviewerApplicationSchema
  .omit({ publicId: true })
  .extend({ applicationId: reviewerApplicationSchema.shape.publicId, ...pageInput.shape });

const createManagerReviewerReads = (actor: Actor, reviewer: ManagerAssignmentOperations) => [
  defineActorTool(
    actor,
    "list_reviewer_history",
    {
      errorSchema: reviewerErrorSchema,
      inputSchema: historyInput,
      outputSchema: reviewerHistorySchema.extend({
        nextPage: historyInput.required({ after: true }).nullable(),
      }),
      description:
        "For program managers: read lifecycle and submitted-assessment events for one assignment, newest first. Pass nextPage to this tool. Never includes private drafts.",
    },
    async (input) => {
      const { applicationId, ...address } = input;
      const result = await reviewer.history(actor, { ...address, publicId: applicationId });
      return result.status === "ok"
        ? { status: "ok" as const, ...cursorPage(input, result.value) }
        : result;
    },
  ),
  defineActorTool(
    actor,
    "list_application_reviewers",
    {
      errorSchema: reviewerErrorSchema,
      inputSchema: reviewersInput,
      outputSchema: reviewerListSchema.extend({
        nextPage: reviewersInput.required({ after: true }).nullable(),
      }),
      description:
        "For program managers: list invited application reviewer assignments, email delivery status, and assignment revision. Use list_application_reviews for received assessments, offline requests, and basis freshness, and list_reviewer_history for assignment lifecycle history. Never includes private drafts. Pass nextPage to this tool.",
    },
    async (input) => {
      const { applicationId, workspaceSlug } = input;
      const result = await reviewer.forApplication(actor, {
        publicId: applicationId,
        workspaceSlug,
      });
      if (result.status !== "ok") {
        return result;
      }
      return { status: "ok" as const, ...pageAssignments(result.value, input) };
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
        "Send an invitation email when the user asks Merit to invite the contact on an existing review request. When the user asks what to say, draft the message directly from the supplied facts. Only refer to an earlier invitation or delivery if the user provided that history. Drafting requires no lookup or email. For sending, the contact email must match a current reviewer or program-manager membership. For a new member, ask a workspace owner or administrator to invite them through Members & access on the website first. Requires verified manager email and a standard workspace. Reuse commandId on retry. Check assignment.delivery after saving. For 'sent', tell the manager the invitation was sent. Inbox receipt is unverified.",
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
