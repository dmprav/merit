import {
  type ReviewerService,
  reviewerAddressSchema,
  reviewerHistoryInput,
  reviewerApplicationSchema,
  inviteReviewerSchema,
  manageReviewerSchema,
  reviewerActionSchema,
  saveReviewerDraftSchema,
  submitReviewerSchema,
} from "@merit/reviews/api";

import { pageInput, pageItems } from "../../components/pagination";
import type { RegisterTool } from "../../components/register-tool";
import { readAnnotations, writeAnnotations } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import {
  reviewerErrorSchema,
  reviewerSavedSchema,
  reviewerListSchema,
  reviewerHistorySchema,
  applicationReviewersSchema,
  reviewerPageSchema,
  reviewerRevisionSchema,
} from "./responses";

const read = { errorSchema: reviewerErrorSchema, annotations: readAnnotations };
const write = { errorSchema: reviewerErrorSchema, annotations: writeAnnotations };

const registerSelfReviewReads = (
  register: RegisterTool,
  actor: McpActor,
  reviewer: ReviewerService,
) => {
  register(
    "list_my_reviews",
    {
      ...read,
      scope: "reviews:read",
      inputSchema: pageInput,
      outputSchema: reviewerListSchema,
      description:
        "List your own review assignments across organizations. No workspace membership is required. Follow nextCursor as after.",
    },
    async (input) => {
      const result = await reviewer.list(actor);
      if (result.status !== "ok") {
        return result;
      }
      const { items: assignments, nextCursor } = pageItems(result.value, input, (item) => item.id);
      return { status: "ok" as const, assignments, nextCursor };
    },
  );
  register(
    "get_reviewer_assignment",
    {
      ...read,
      scope: "reviews:read",
      inputSchema: reviewerAddressSchema,
      outputSchema: reviewerPageSchema,
      description:
        "Read your assignment, assigned evidence, criteria, private draft, and submitted versions. Evidence is unavailable until acceptance. Preserve assignment.revision and draft.revision for writes. Amounts in drafts and assessments are decimal EUR strings.",
    },
    async (input) => {
      const result = await reviewer.read(actor, input);
      return result.status === "ok" ? { status: "ok" as const, ...result.value } : result;
    },
  );
};

const registerManagerReviewerReads = (
  register: RegisterTool,
  actor: McpActor,
  reviewer: ReviewerService,
) => {
  register(
    "list_reviewer_history",
    {
      ...read,
      scope: "workspace:read",
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
  );
  register(
    "list_application_reviewers",
    {
      ...read,
      scope: "workspace:read",
      inputSchema: reviewerApplicationSchema
        .omit({ publicId: true })
        .extend({ applicationId: reviewerApplicationSchema.shape.publicId, ...pageInput.shape }),
      outputSchema: applicationReviewersSchema,
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
  );
};

const registerManagerAssignments = (
  register: RegisterTool,
  actor: McpActor,
  reviewer: ReviewerService,
) => {
  register(
    "invite_reviewer",
    {
      ...write,
      scope: "grants:write",
      annotations: { ...writeAnnotations, openWorldHint: true },
      inputSchema: inviteReviewerSchema
        .omit({ publicId: true })
        .extend({ applicationId: inviteReviewerSchema.shape.publicId }),
      outputSchema: reviewerSavedSchema,
      description:
        "Invite the contact on an existing review request to assess this application. Sends email; requires verified manager email and a standard workspace. Reuse commandId on retry. Inspect delivery after saving.",
    },
    async ({ applicationId, ...input }) => {
      const result = await reviewer.invite(actor, { ...input, publicId: applicationId });
      return result.status === "ok" ? { status: "ok" as const, assignment: result.value } : result;
    },
  );
  register(
    "manage_reviewer_assignment",
    {
      ...write,
      scope: "grants:write",
      annotations: { ...writeAnnotations, openWorldHint: true },
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
  );
};

const registerReviewerActions = (
  register: RegisterTool,
  actor: McpActor,
  reviewer: ReviewerService,
) => {
  register(
    "respond_to_review",
    {
      ...write,
      scope: "reviews:write",
      inputSchema: reviewerActionSchema,
      outputSchema: reviewerSavedSchema,
      description:
        "Accept or decline your assignment, withdraw before submission using decline, or report a conflict with a note. Acceptance verifies your invited email; reporting a conflict pauses access. Preserve expectedRevision and commandId on retry.",
    },
    async (input) => {
      const result = await reviewer.respond(actor, input);
      return result.status === "ok" ? { status: "ok" as const, assignment: result.value } : result;
    },
  );
  register(
    "save_reviewer_draft",
    {
      ...write,
      scope: "reviews:write",
      inputSchema: saveReviewerDraftSchema,
      outputSchema: reviewerRevisionSchema,
      description:
        "Save your private draft against expectedDraftRevision. Amount is a decimal EUR string. For an amendment include an explanation in draft.note. Reuse commandId and the original revision after an unconfirmed save. Managers cannot read this draft.",
    },
    async (input) => {
      const result = await reviewer.saveDraft(actor, input);
      return result.status === "ok"
        ? { status: "ok" as const, draftRevision: result.value.revision }
        : result;
    },
  );
  register(
    "submit_reviewer_assessment",
    {
      ...write,
      scope: "reviews:write",
      annotations: { ...writeAnnotations, openWorldHint: true },
      inputSchema: submitReviewerSchema,
      outputSchema: reviewerRevisionSchema,
      description:
        "Submit your saved draft or amendment against expectedDraftRevision. Records you as author and notifies the manager. Requires position and reasoning; funding positions require a positive amount. Amendments require a note. Reuse commandId on retry; read the assignment for notification status.",
    },
    async (input) => {
      const result = await reviewer.submit(actor, input);
      return result.status === "ok"
        ? { status: "ok" as const, draftRevision: result.value.revision }
        : result;
    },
  );
};

export const registerReviewerTools = (
  register: RegisterTool,
  actor: McpActor,
  reviewer: ReviewerService,
) => {
  registerSelfReviewReads(register, actor, reviewer);
  registerManagerReviewerReads(register, actor, reviewer);
  registerManagerAssignments(register, actor, reviewer);
  registerReviewerActions(register, actor, reviewer);
};
