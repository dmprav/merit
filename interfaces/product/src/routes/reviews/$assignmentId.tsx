import { createFileRoute, redirect } from "@tanstack/react-router";

import { reviewerPageOptions } from "../../features/grantmaking/data/reviews/reviewer-data";
import { ReviewerEntry } from "../../features/grantmaking/reviewer-page";

const Page = () => {
  const result = Route.useLoaderData();
  const { assignmentId } = Route.useParams();
  return (
    <ReviewerEntry
      page={result.status === "ok" ? result.value : undefined}
      status={result.status}
      assignmentId={assignmentId}
    />
  );
};

export const Route = createFileRoute("/_product/reviews/$assignmentId")({
  loader: async ({ params, context }) => {
    const result = await context.queryClient.fetchQuery(reviewerPageOptions(params.assignmentId));
    if (result.status === "ok" && !result.value.membershipRequired) {
      throw redirect({
        to: "/app/$workspaceSlug/work/$assignmentId",
        params: {
          workspaceSlug: result.value.assignment.workspaceSlug,
          assignmentId: params.assignmentId,
        },
        replace: true,
      });
    }
    return result;
  },
  headers: () => ({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }),
  staleTime: 0,
  gcTime: 0,
  component: Page,
  errorComponent: () => <ReviewerEntry status="unavailable" />,
});
