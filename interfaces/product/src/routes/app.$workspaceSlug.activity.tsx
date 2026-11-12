import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { WorkspaceActivity } from "@merit/grantmaking-web/activity";
import { PageHeader } from "@merit/ui/page-header";

import { AppPage } from "../app/app-shell";
import { webTranslator } from "../app/messages";
import { WorkspaceStatusPage } from "../app/workspace-page";
import { resourceRef } from "../features/grantmaking/contracts/resource-url";
import { activityOptions, roundsOptions } from "../features/grantmaking/data/queries";
import {
  noActivityFilters,
  useWorkspaceActivity,
} from "../features/grantmaking/data/workspace-activity";
import { workspaceOptions } from "../features/workspace/data/queries";

const WorkspaceActivityPage = () => {
  const { workspaceSlug } = Route.useParams();
  const { t } = useTranslation("web");
  const { data: workspace } = useSuspenseQuery(workspaceOptions(workspaceSlug));
  const { data: roundResult } = useSuspenseQuery(roundsOptions(workspaceSlug));
  const activity = useWorkspaceActivity(workspaceSlug);
  const failed = [workspace, roundResult, activity].find((result) => result.status !== "ok");
  if (failed || activity.status !== "ok" || roundResult.status !== "ok") {
    return <WorkspaceStatusPage resource="activity" status={failed?.status ?? "unavailable"} />;
  }

  return (
    <AppPage width="full" breadcrumb={[t("navigation.activity")]}>
      <PageHeader title={t("navigation.activity")} />
      <WorkspaceActivity
        {...activity}
        status={activity.loading}
        rounds={roundResult.rounds.map((round) => ({ id: round.publicId, title: round.title }))}
        renderRecordLink={(record, label) =>
          record.kind === "round" ? (
            <Link
              to="/app/$workspaceSlug/rounds/$roundRef"
              params={{ workspaceSlug, roundRef: resourceRef(record.title, record.id) }}
            >
              {label}
            </Link>
          ) : (
            <Link
              to="/app/$workspaceSlug/applications/$applicationRef"
              params={{ workspaceSlug, applicationRef: resourceRef(record.title, record.id) }}
            >
              {label}
            </Link>
          )
        }
      />
    </AppPage>
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/activity")({
  loader: async ({ params, context }) => {
    const workspace = await context.queryClient.fetchQuery(workspaceOptions(params.workspaceSlug));
    if (workspace.status === "ok" && !workspace.workspace.canWorkOnGrants) {
      throw redirect({ to: "/app/$workspaceSlug/settings/members", params, replace: true });
    }
    await Promise.all([
      context.queryClient.fetchInfiniteQuery(
        activityOptions(params.workspaceSlug, noActivityFilters),
      ),
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
          title: webTranslator(context.locale)("navigation.activity"),
        }),
      },
    ],
  }),
  component: WorkspaceActivityPage,
  pendingComponent: () => <WorkspaceStatusPage resource="activity" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="activity" status="unavailable" />,
});
