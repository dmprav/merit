import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppPage } from "../app/app-shell";
import { webTranslator } from "../app/messages";
import { WorkspaceStatusPage } from "../app/workspace-page";
import { teamOptions } from "../features/team/data/queries";
import { TeamView } from "../features/team/team-view";

const TeamPage = () => {
  const { t } = useTranslation(["team", "web"]);
  const params = Route.useParams();
  const { data: result } = useSuspenseQuery(teamOptions(params.workspaceSlug));
  if (result.status !== "ok") {
    return (
      <WorkspaceStatusPage
        resource="team"
        status={
          result.status === "signed_out"
            ? "signed_out"
            : result.status === "unavailable"
              ? "unavailable"
              : "workspace_not_found"
        }
      />
    );
  }

  return (
    <AppPage breadcrumb={[t("web:navigation.settings"), t("title")]}>
      <TeamView key={result.value.organization.id} initial={result.value} />
    </AppPage>
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/settings/members")({
  loader: async ({ params, context }) => {
    await context.queryClient.fetchQuery(teamOptions(params.workspaceSlug));
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return { meta: [{ title: t("common:pageTitle", { title: t("team:title") }) }] };
  },
  pendingComponent: () => <WorkspaceStatusPage resource="team" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="team" status="unavailable" />,
  component: TeamPage,
});
