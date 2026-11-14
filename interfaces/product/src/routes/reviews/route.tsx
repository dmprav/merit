import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";

import { AppShell } from "../../app/app-shell";
import { ReviewerSignIn } from "../../features/grantmaking/reviewer-page";
import { workspacesOptions } from "../../features/workspace/data/queries";
import { loadWorkspaceNavigation } from "../../features/workspace/workspace-navigation-provider";

const ReviewsLayout = () => {
  // Discovery also tells a signed-out visitor apart from a reviewer without workspaces.
  const { data } = useQuery(workspacesOptions());
  const { assignmentId } = useParams({ strict: false });
  if (data?.status === "signed_out") {
    return <ReviewerSignIn assignmentId={assignmentId} />;
  }

  return (
    <AppShell current={{ kind: "reviews" }}>
      <Outlet />
    </AppShell>
  );
};

export const Route = createFileRoute("/_product/reviews")({
  loader: ({ context }) => loadWorkspaceNavigation(context.queryClient),
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: ReviewsLayout,
});
