import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";
import {
  type ReviewerService,
  reviewerAddressSchema,
  reviewerApplicationSchema,
  reviewerActionSchema,
  saveReviewerDraftSchema,
  submitReviewerSchema,
} from "@merit/reviews/api";

import {
  pageInput,
  pageAssignments,
  reviewerErrorSchema,
  reviewerSavedSchema,
  reviewerListSchema,
  reviewerPageSchema,
  reviewerRevisionSchema,
} from "./assignments";

const myReviewsInput = pageInput.extend({
  workspaceSlug: reviewerApplicationSchema.shape.workspaceSlug.optional(),
});

const reviewerReads = (actor: Actor, reviewer: Pick<ReviewerService, "list" | "read">) =>
  [
    defineActorTool(
      actor,
      "list_my_reviews",
      {
        errorSchema: reviewerErrorSchema,
        inputSchema: myReviewsInput,
        outputSchema: reviewerListSchema.extend({
          nextPage: myReviewsInput.required({ after: true }).nullable(),
        }),
        description:
          "List your own review assignments in current qualifying workspace memberships. Pass workspaceSlug for My work in one workspace; omit it for the existing cross-workspace listing. Pass nextPage to this tool.",
      },
      async (input) => {
        const result = input.workspaceSlug
          ? await reviewer.list(actor, { workspaceSlug: input.workspaceSlug })
          : await reviewer.list(actor);
        if (result.status !== "ok") {
          return result;
        }
        return { status: "ok" as const, ...pageAssignments(result.value, input) };
      },
    ),
    defineActorTool(
      actor,
      "get_reviewer_assignment",
      {
        errorSchema: reviewerErrorSchema,
        inputSchema: reviewerAddressSchema,
        outputSchema: reviewerPageSchema,
        description:
          "Read your assignment, assigned evidence, criteria, private draft, and submitted versions. Evidence is unavailable until acceptance. Preserve assignment.revision and draft.revision for writes. Draft amounts are decimal strings. Submitted assessment amounts use { minorUnits, currency } or null when unstated.",
      },
      async (input) => {
        const result = await reviewer.read(actor, input);
        return result.status === "ok" ? { status: "ok" as const, ...result.value } : result;
      },
    ),
  ] as const;

const reviewerWrites = (
  actor: Actor,
  reviewer: Pick<ReviewerService, "respond" | "saveDraft" | "submit">,
) =>
  [
    defineActorTool(
      actor,
      "respond_to_review",
      {
        errorSchema: reviewerErrorSchema,
        inputSchema: reviewerActionSchema,
        outputSchema: reviewerSavedSchema,
        description:
          "Accept or decline your assignment, withdraw before submission using decline, or report a conflict with a note. Acceptance verifies your invited email; reporting a conflict pauses access. Preserve expectedRevision and commandId on retry.",
      },
      async (input) => {
        const result = await reviewer.respond(actor, input);
        return result.status === "ok"
          ? { status: "ok" as const, assignment: result.value }
          : result;
      },
    ),
    defineActorTool(
      actor,
      "save_reviewer_draft",
      {
        errorSchema: reviewerErrorSchema,
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
    ),
    defineActorTool(
      actor,
      "submit_reviewer_assessment",
      {
        errorSchema: reviewerErrorSchema,
        inputSchema: submitReviewerSchema,
        outputSchema: reviewerRevisionSchema,
        description:
          "Submit your saved draft or amendment against expectedDraftRevision. Records you as author. The manager can read each version. Submission email is rate-limited. Requires position and reasoning; funding positions require a positive amount. Amendments require a note. Reuse commandId on retry. Read assignment.notification for the latest queued submission email.",
      },
      async (input) => {
        const result = await reviewer.submit(actor, input);
        return result.status === "ok"
          ? { status: "ok" as const, draftRevision: result.value.revision }
          : result;
      },
    ),
  ] as const;

export const createReviewerTools = (
  actor: Actor,
  reviewer: Pick<ReviewerService, "list" | "read" | "respond" | "saveDraft" | "submit">,
) => [...reviewerReads(actor, reviewer), ...reviewerWrites(actor, reviewer)];
