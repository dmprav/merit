import type { QueryClient } from "@tanstack/react-query";

import { createReviewData } from "@merit/reviews-web/data";
import type { ManagerReviewerData } from "@merit/reviews-web/reviewer";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import {
  applicationReviewers,
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
