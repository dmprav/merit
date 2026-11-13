import type { QueryClient } from "@tanstack/react-query";

import { available } from "@merit/query";
import { createReviewData } from "@merit/reviews-web/data";
import type { ManagerReviewerData } from "@merit/reviews-web/reviewer";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import {
  applicationReviewers,
  readReviewerHistory,
  inviteReviewer,
  manageReviewer,
} from "../server/reviews/reviewer.functions";
import { saveReview } from "../server/reviews/reviews.functions";

export const workspaceReviewData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  inviteReviewers: boolean,
) => {
  const result = createReviewData(
    client,
    { workspaceSlug, publicId },
    {
      grantWorkScope: grantWorkQueryKey(workspaceSlug),
      save: (data) => saveReview({ data }),
    },
  );
  if (!inviteReviewers) {
    return result;
  }
  const participation: ManagerReviewerData = {
    historySource: (assignment) => ({
      queryKey: [
        ...grantWorkQueryKey(workspaceSlug),
        publicId,
        "reviewerHistory",
        assignment.id,
        assignment.revision,
      ],
      read: async (after, signal) => {
        const result = available(
          await readReviewerHistory({
            data: { workspaceSlug, publicId, assignmentId: assignment.id, after },
            signal,
          }),
        );
        return result.status === "ok" ? result.value : null;
      },
    }),
    read: () => applicationReviewers({ data: { workspaceSlug, publicId } }),
    invite: (requestId, dueDate, commandId) =>
      inviteReviewer({ data: { workspaceSlug, publicId, requestId, dueDate, commandId } }),
    manage: (assignment, action, note, commandId) =>
      manageReviewer({
        data: {
          workspaceSlug,
          publicId,
          assignmentId: assignment.id,
          expectedRevision: assignment.revision,
          action,
          note,
          commandId,
        },
      }),
    refresh: result.refresh,
  };
  return { ...result, participation };
};
