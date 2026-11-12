import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ApplicationsOverview } from "@merit/grantmaking-web/rounds";
import { PageHeader } from "@merit/ui/page-header";

import { AppPage } from "../app/app-shell";
import { webTranslator } from "../app/messages";
import { WorkspaceStatusPage } from "../app/workspace-page";
import { applicationsSearch } from "../features/grantmaking/contracts/applications-location";
import { resourceRef } from "../features/grantmaking/contracts/resource-url";
import { applicationsOptions, roundsOptions } from "../features/grantmaking/data/queries";
import { WorkspaceApplicationCreate } from "../features/grantmaking/workspace-application-create";
import { workspaceOptions } from "../features/workspace/data/queries";

const WorkspaceApplications = () => {
  const { workspaceSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t } = useTranslation(["web", "fundingRounds"]);
  const { data: workspace } = useSuspenseQuery(workspaceOptions(workspaceSlug));
  const { data: result } = useSuspenseQuery(applicationsOptions(workspaceSlug));
  const { data: roundResult } = useSuspenseQuery(roundsOptions(workspaceSlug));
  if (workspace.status !== "ok") {
    return <WorkspaceStatusPage resource="applications" status={workspace.status} />;
  }
  if (result.status !== "ok") {
    return <WorkspaceStatusPage resource="applications" status={result.status} />;
  }
  if (roundResult.status !== "ok") {
    return <WorkspaceStatusPage resource="applications" status={roundResult.status} />;
  }
  const rounds = roundResult.rounds.map((round) => ({ id: round.publicId, title: round.title }));

  return (
    <AppPage width="full" breadcrumb={[t("web:navigation.applications")]}>
      <PageHeader
        title={t("web:navigation.applications")}
        actions={
          <WorkspaceApplicationCreate
            workspaceSlug={workspaceSlug}
            rounds={rounds}
            search={search}
          />
        }
      />
      <ApplicationsOverview
        applications={result.applications}
        rounds={rounds}
        roundId={search.round ?? ""}
        onRoundChange={(round) =>
          void navigate({
            search: { ...search, round: round || undefined },
            replace: true,
            resetScroll: false,
          })
        }
        sorting={
          search.sort ? { columnId: search.sort, direction: search.direction ?? "ascending" } : null
        }
        onSortingChange={(sorting) =>
          void navigate({
            search: applicationsSearch({
              ...search,
              sort: sorting?.columnId,
              direction: sorting?.direction,
            }),
            replace: true,
            resetScroll: false,
          })
        }
        renderApplicationLink={(application, label, reviews) => (
          <Link
            to="/app/$workspaceSlug/applications/$applicationRef"
            params={{
              workspaceSlug,
              applicationRef: resourceRef(application.title, application.id),
            }}
            search={{ ...search, from: "applications", tab: reviews ? "reviews" : undefined }}
          >
            {label}
          </Link>
        )}
        renderRoundLink={(application) => (
          <Link
            to="/app/$workspaceSlug/rounds/$roundRef"
            params={{
              workspaceSlug,
              roundRef: resourceRef(application.roundTitle, application.roundId),
            }}
          >
            {application.roundTitle}
          </Link>
        )}
      />
    </AppPage>
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/applications/")({
  validateSearch: applicationsSearch,
  loader: async ({ params, context }) => {
    const workspace = await context.queryClient.fetchQuery(workspaceOptions(params.workspaceSlug));
    if (workspace.status === "ok" && !workspace.workspace.canWorkOnGrants) {
      throw redirect({ to: "/app/$workspaceSlug/settings/members", params, replace: true });
    }
    await Promise.all([
      context.queryClient.fetchQuery(applicationsOptions(params.workspaceSlug)),
      context.queryClient.fetchQuery(roundsOptions(params.workspaceSlug)),
    ]);
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => ({
    meta: [
      {
        title: webTranslator(context.locale)("common:pageTitle", {
          title: webTranslator(context.locale)("navigation.applications"),
        }),
      },
    ],
  }),
  component: WorkspaceApplications,
  pendingComponent: () => <WorkspaceStatusPage resource="applications" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="applications" status="unavailable" />,
});
