import { queryOptions } from "@tanstack/react-query";

import { available, privateKey } from "@merit/query";
import type { ReviewerData } from "@merit/reviews-web/reviewer";

import {
  listReviewerAssignments,
  readReviewerAssignment,
  respondToReview,
  saveReviewerDraft,
  submitReviewerAssessment,
} from "../server/reviews/reviewer.functions";

export const reviewerListOptions = () =>
  queryOptions({
    queryKey: [...privateKey, "reviewer", "assignments"],
    queryFn: async ({ signal }) => available(await listReviewerAssignments({ signal })),
  });

export const reviewerPageOptions = (assignmentId: string) =>
  queryOptions({
    queryKey: [...privateKey, "reviewer", "assignment", assignmentId],
    queryFn: async ({ signal }) =>
      available(await readReviewerAssignment({ signal, data: { assignmentId } })),
  });

export const reviewerData = (assignmentId: string): ReviewerData => ({
  read: () => readReviewerAssignment({ data: { assignmentId } }),
  respond: (data) => respondToReview({ data }),
  save: (data) => saveReviewerDraft({ data }),
  submit: (data) => submitReviewerAssessment({ data }),
});
