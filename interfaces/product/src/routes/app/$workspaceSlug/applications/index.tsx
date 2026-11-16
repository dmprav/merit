import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ApplicationsOverview } from "@merit/grantmaking-web/rounds";
import { PageHeader } from "@merit/ui/page-header";

import { AppPage } from "../../../../app/app-shell";
import { webTranslator } from "../../../../app/messages";
import { WorkspaceStatusPage } from "../../../../app/workspace-page";
import { applicationsSearch } from "../../../../features/grantmaking/contracts/applications-location";
import { resourceRef } from "../../../../features/grantmaking/contracts/resource-url";
import { applicationsOptions, roundsOptions } from "../../../../features/grantmaking/data/queries";
import { useWorkspaceApplications } from "../../../../features/grantmaking/data/workspace-applications";
import { WorkspaceApplicationCreate } from "../../../../features/grantmaking/workspace-application-create";
import { workspaceOptions } from "../../../../features/workspace/data/queries";

const WorkspaceApplications = () => {
  const { workspaceSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const result = useWorkspaceApplications(workspaceSlug, {
    viewId: "workspace",
    roundId: search.round,
    sorting: {
      value: search.sort
        ? { columnId: search.sort, direction: search.direction ?? "ascending" }
        : null,
      onChange: (sorting) =>
        void navigate({
          search: (current) =>
            applicationsSearch({
              ...current,
              sort: sorting?.columnId,
              direction: sorting?.direction,
            }),
          replace: true,
          resetScroll: false,
        }),
    },
  });
  const { t } = useTranslation(["web", "fundingRounds"]);
  const { data: workspace } = useSuspenseQuery(workspaceOptions(workspaceSlug));
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
        {...result}
        rounds={rounds}
        roundId={search.round ?? ""}
        onRoundChange={(round) =>
          void navigate({
            search: (current) => ({ ...current, round: round || undefined }),
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
