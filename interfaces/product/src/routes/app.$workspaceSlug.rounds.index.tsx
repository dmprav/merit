import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { FundingRoundsScreen } from "../app/funding-round-screens";
import { webTranslator } from "../app/messages";
import { WorkspaceStatusPage } from "../app/workspace-page";
import { resourceRef } from "../features/grantmaking/contracts/resource-url";
import { roundsOptions } from "../features/grantmaking/data/queries";
import { useWorkspaceRoundsData } from "../features/grantmaking/data/workspace-data";
import { workspaceOptions } from "../features/workspace/data/queries";

const Workspace = () => {
  const { workspaceSlug } = Route.useParams();
  const { data: result } = useSuspenseQuery(workspaceOptions(workspaceSlug));
  if (result.status !== "ok") {
    return <WorkspaceStatusPage resource="rounds" status={result.status} />;
  }
  return <WorkspaceRounds workspace={result.workspace} />;
};

const WorkspaceRounds = ({
  workspace,
}: {
  workspace: { slug: string; name: string; canWorkOnGrants: boolean };
}) => {
  const result = useWorkspaceRoundsData(workspace.slug, workspace.name);
  if (result.status !== "ok") {
    return <WorkspaceStatusPage resource="rounds" status={result.status} />;
  }

  return (
    <FundingRoundsScreen
      data={result.data}
      renderRoundLink={(round) => (
        <Link
          to="/app/$workspaceSlug/rounds/$roundRef"
          params={{
            workspaceSlug: round.workspaceSlug,
            roundRef: resourceRef(round.title, round.publicId),
          }}
        >
          {round.title}
        </Link>
      )}
      renderApplicationsLink={(round, children) => (
        <Link
          to="/app/$workspaceSlug/rounds/$roundRef"
          params={{
            workspaceSlug: round.workspaceSlug,
            roundRef: resourceRef(round.title, round.publicId),
          }}
          search={{ section: "applications" }}
        >
          {children}
        </Link>
      )}
    />
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/rounds/")({
  loader: async ({ params, context }) => {
    const [result] = await Promise.all([
      context.queryClient.fetchQuery(workspaceOptions(params.workspaceSlug)),
      context.queryClient.fetchQuery(roundsOptions(params.workspaceSlug)),
    ]);
    if (result.status === "ok" && !result.workspace.canWorkOnGrants) {
      throw redirect({ to: "/app/$workspaceSlug/settings/members", params, replace: true });
    }
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return { meta: [{ title: t("common:pageTitle", { title: t("navigation.rounds") }) }] };
  },
  component: Workspace,
  pendingComponent: () => <WorkspaceStatusPage resource="rounds" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="rounds" status="unavailable" />,
});
