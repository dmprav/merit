import type { QueryClient } from "@tanstack/react-query";

import { createAiReviewData } from "@merit/reviews-web/data/ai-review";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import { runAiReview } from "../server/reviews/ai-reviews.functions";

export const workspaceAiReviewData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  page: Parameters<typeof createAiReviewData>[2],
) =>
  createAiReviewData(
    client,
    {
      grantWorkScope: grantWorkQueryKey(workspaceSlug),
      run: (runId) => runAiReview({ data: { workspaceSlug, publicId, runId } }),
    },
    page,
  );
