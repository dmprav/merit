import { fn } from "storybook/test";

import type * as actual from "../reviewer.functions";

export const listReviewerAssignments = fn<
  (
    ...args: Parameters<typeof actual.listReviewerAssignments>
  ) => ReturnType<typeof actual.listReviewerAssignments>
>(async () => {
  throw new Error("Configure listReviewerAssignments in the story");
});
export const readReviewerAssignment = fn<
  (
    ...args: Parameters<typeof actual.readReviewerAssignment>
  ) => ReturnType<typeof actual.readReviewerAssignment>
>(async () => {
  throw new Error("Configure readReviewerAssignment in the story");
});
export const applicationReviewers = fn<
  (
    ...args: Parameters<typeof actual.applicationReviewers>
  ) => ReturnType<typeof actual.applicationReviewers>
>(async () => {
  throw new Error("Configure applicationReviewers in the story");
});
export const inviteReviewer = fn<
  (...args: Parameters<typeof actual.inviteReviewer>) => ReturnType<typeof actual.inviteReviewer>
>(async () => {
  throw new Error("Configure inviteReviewer in the story");
});
export const manageReviewer = fn<
  (...args: Parameters<typeof actual.manageReviewer>) => ReturnType<typeof actual.manageReviewer>
>(async () => {
  throw new Error("Configure manageReviewer in the story");
});
export const respondToReview = fn<
  (...args: Parameters<typeof actual.respondToReview>) => ReturnType<typeof actual.respondToReview>
>(async () => {
  throw new Error("Configure respondToReview in the story");
});
export const saveReviewerDraft = fn<
  (
    ...args: Parameters<typeof actual.saveReviewerDraft>
  ) => ReturnType<typeof actual.saveReviewerDraft>
>(async () => {
  throw new Error("Configure saveReviewerDraft in the story");
});
export const submitReviewerAssessment = fn<
  (
    ...args: Parameters<typeof actual.submitReviewerAssessment>
  ) => ReturnType<typeof actual.submitReviewerAssessment>
>(async () => {
  throw new Error("Configure submitReviewerAssessment in the story");
});
