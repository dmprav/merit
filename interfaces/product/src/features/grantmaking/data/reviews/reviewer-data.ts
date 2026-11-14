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

export const reviewerListOptions = (workspaceSlug: string) =>
  queryOptions({
    queryKey: [...privateKey, "reviewer", "assignments", workspaceSlug],
    queryFn: async ({ signal }) =>
      available(await listReviewerAssignments({ signal, data: { workspaceSlug } })),
  });

export const reviewerPageOptions = (assignmentId: string, workspaceSlug?: string) =>
  queryOptions({
    queryKey: [...privateKey, "reviewer", "assignment", assignmentId, workspaceSlug],
    queryFn: async ({ signal }) =>
      available(await readReviewerAssignment({ signal, data: { assignmentId, workspaceSlug } })),
  });

export const reviewerData = (assignmentId: string, workspaceSlug?: string): ReviewerData => ({
  read: () => readReviewerAssignment({ data: { assignmentId, workspaceSlug } }),
  respond: (data) => respondToReview({ data }),
  save: (data) => saveReviewerDraft({ data }),
  submit: (data) => submitReviewerAssessment({ data }),
});
