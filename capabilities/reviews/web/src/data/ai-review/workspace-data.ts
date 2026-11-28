import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { AiReviewData, AiReviewTransport } from "../../contracts/ai-review";

type AiReviewSource = {
  run: AiReviewTransport;
  grantWorkScope: QueryKey;
};

/** Runs an AI review of one application and refreshes the page that lists its reviews. */
export const createAiReviewData = (
  client: QueryClient,
  source: AiReviewSource,
  page: Pick<AiReviewData, "reviews" | "availability" | "provider">,
): AiReviewData => ({
  ...page,
  run: source.run,
  refresh: () =>
    client.invalidateQueries({ queryKey: source.grantWorkScope }, { throwOnError: true }),
});
