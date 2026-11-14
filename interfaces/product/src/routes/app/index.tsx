import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { webTranslator } from "../../app/messages";
import { WorkspaceRecovery } from "../../app/workspace-page";
import { reviewerListOptions } from "../../features/grantmaking/data/reviews/reviewer-data";
import { workspacesOptions } from "../../features/workspace/data/queries";
import { WorkspaceChoice } from "../../features/workspace/views/workspace-choice";
import { workspaceHomeLocation } from "../../shared/workspace-location";

const WorkspaceIndex = () => {
  const { data: result } = useSuspenseQuery(workspacesOptions());

  return result.status === "ok" ? (
    result.value.length || result.canAdminister ? (
      <WorkspaceChoice workspaces={result.value} canAdminister={result.canAdminister} />
    ) : (
      <WorkspaceRecovery status="no_workspace" />
    )
  ) : (
    <WorkspaceRecovery status={result.status === "signed_out" ? "signed_out" : "unavailable"} />
  );
};

export const Route = createFileRoute("/_product/app/")({
  loader: async ({ context }) => {
    const result = await context.queryClient.fetchQuery(workspacesOptions());
    if (result.status === "ok" && result.value.length === 0 && !result.canAdminister) {
      const reviews = await context.queryClient.fetchQuery(reviewerListOptions());
      if (reviews.status === "ok" && reviews.value.length) {
        throw redirect({ to: "/reviews", replace: true });
      }
    }
    if (result.status !== "ok" || result.value.length !== 1) {
      return;
    }

    const [workspace] = result.value;
    if (!workspace) {
      return;
    }

    throw redirect({
      ...workspaceHomeLocation(workspace),
      replace: true,
      headers: { "Cache-Control": "private, no-store" },
    });
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return { meta: [{ title: t("page.workspace") }] };
  },
  component: WorkspaceIndex,
  pendingComponent: () => <WorkspaceRecovery status="loading" />,
  errorComponent: () => <WorkspaceRecovery status="unavailable" />,
});
