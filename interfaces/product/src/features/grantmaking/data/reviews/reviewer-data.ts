import { queryOptions } from "@tanstack/react-query";

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
    queryKey: ["reviewer", "assignments"],
    queryFn: () => listReviewerAssignments(),
    staleTime: 0,
    gcTime: 0,
  });

export const reviewerPageOptions = (assignmentId: string) =>
  queryOptions({
    queryKey: ["reviewer", "assignment", assignmentId],
    queryFn: () => readReviewerAssignment({ data: { assignmentId } }),
    staleTime: 0,
    gcTime: 0,
  });

export const reviewerData = (assignmentId: string): ReviewerData => ({
  read: () => readReviewerAssignment({ data: { assignmentId } }),
  respond: (data) => respondToReview({ data }),
  save: (data) => saveReviewerDraft({ data }),
  submit: (data) => submitReviewerAssessment({ data }),
});
