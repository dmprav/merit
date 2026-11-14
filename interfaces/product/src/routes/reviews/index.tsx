import { createFileRoute } from "@tanstack/react-router";

import { reviewerListOptions } from "../../features/grantmaking/data/reviews/reviewer-data";
import { ReviewerListPage, ReviewerUnavailable } from "../../features/grantmaking/reviewer-page";

export const Route = createFileRoute("/_product/reviews/")({
  loader: ({ context }) => context.queryClient.fetchQuery(reviewerListOptions()),
  headers: () => ({ "Cache-Control": "private, no-store" }),
  staleTime: 0,
  gcTime: 0,
  component: ReviewerListPage,
  errorComponent: () => <ReviewerUnavailable />,
});
