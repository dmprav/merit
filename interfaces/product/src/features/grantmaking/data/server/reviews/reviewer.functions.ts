import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { reviewerHistoryInput } from "@merit/reviews/api";
import {
  reviewerAddressSchema,
  reviewerApplicationSchema,
  inviteReviewerSchema,
  manageReviewerSchema,
  reviewerActionSchema,
  saveReviewerDraftSchema,
  submitReviewerSchema,
} from "@merit/reviews/api";

export const listReviewerAssignments = createServerFn({ method: "GET" }).handler(({ context }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return withActor(context.currentIdentity, (actor) => context.reviewer.list(actor));
});
export const readReviewerAssignment = createServerFn({ method: "GET" })
  .validator(reviewerAddressSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.read(actor, data));
  });
export const applicationReviewers = createServerFn({ method: "GET" })
  .validator(reviewerApplicationSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.reviewer.forApplication(actor, data),
    );
  });
export const inviteReviewer = createServerFn({ method: "POST" })
  .validator(inviteReviewerSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.invite(actor, data));
  });
export const manageReviewer = createServerFn({ method: "POST" })
  .validator(manageReviewerSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.manage(actor, data));
  });
export const respondToReview = createServerFn({ method: "POST" })
  .validator(reviewerActionSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.respond(actor, data));
  });
export const saveReviewerDraft = createServerFn({ method: "POST" })
  .validator(saveReviewerDraftSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.saveDraft(actor, data));
  });
export const submitReviewerAssessment = createServerFn({ method: "POST" })
  .validator(submitReviewerSchema)
  .handler(({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.submit(actor, data));
  });

export const readReviewerHistory = createServerFn({ method: "GET" })
  .validator(reviewerHistoryInput)
  .handler(({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) => context.reviewer.history(actor, data));
  });
