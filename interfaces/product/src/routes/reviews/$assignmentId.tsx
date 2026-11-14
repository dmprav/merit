import { createFileRoute } from "@tanstack/react-router";

import { reviewerPageOptions } from "../../features/grantmaking/data/reviews/reviewer-data";
import {
  ReviewerAssignmentPage,
  ReviewerUnavailable,
} from "../../features/grantmaking/reviewer-page";

const Page = () => <ReviewerAssignmentPage assignmentId={Route.useParams().assignmentId} />;

export const Route = createFileRoute("/_product/reviews/$assignmentId")({
  loader: ({ params, context }) =>
    context.queryClient.fetchQuery(reviewerPageOptions(params.assignmentId)),
  headers: () => ({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }),
  staleTime: 0,
  gcTime: 0,
  component: Page,
  errorComponent: () => <ReviewerUnavailable />,
});
