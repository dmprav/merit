import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ApplicationScreen } from "../../../../app/funding-round-screens";
import { webTranslator } from "../../../../app/messages";
import { WorkspaceStatusPage } from "../../../../app/workspace-page";
import {
  applicationsSearch,
  workspaceApplicationsLocation,
  type ApplicationsSearch,
} from "../../../../features/grantmaking/contracts/applications-location";
import { publicIdFromRef } from "../../../../features/grantmaking/contracts/resource-url";
import { useWorkspaceApplicationData } from "../../../../features/grantmaking/data/workspace-data";
import {
  loadApplicationPage,
  workspaceRoundsLocation,
  roundLocation,
} from "../../../../features/grantmaking/page-routing";

const ApplicationPage = () => {
  const params = Route.useParams();
  const result = useWorkspaceApplicationData(
    params.workspaceSlug,
    publicIdFromRef(params.applicationRef) ?? "",
  );
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  if (result.status !== "ok") {
    return <WorkspaceStatusPage resource="application" status={result.status} />;
  }

  const roundsLocation = workspaceRoundsLocation(params.workspaceSlug);

  return (
    <ApplicationScreen
      data={result.data}
      roundsLocation={roundsLocation}
      applicationsLocation={
        search.from === "applications"
          ? workspaceApplicationsLocation(params.workspaceSlug, applicationsSearch(search))
          : undefined
      }
      roundLocation={{
        ...roundLocation({ workspaceSlug: result.workspaceSlug, round: result.data.round }),
        search: { section: "applications" },
      }}
      tab={search.tab}
      onTabChange={(tab) =>
        navigate({
          search: { ...search, tab: tab === "reviews" ? "reviews" : undefined },
          replace: true,
          resetScroll: false,
        })
      }
    />
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/applications/$applicationRef")({
  validateSearch: (
    search: Record<string, unknown>,
  ): ApplicationsSearch & { from?: "applications"; tab?: "reviews"; guide?: "workshop" } => ({
    ...(search.from === "applications" ? applicationsSearch(search) : {}),
    from: search.from === "applications" ? "applications" : undefined,
    tab: search.tab === "reviews" ? "reviews" : undefined,
    guide: search.guide === "workshop" ? "workshop" : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, context }) => {
    const page = await loadApplicationPage(
      context.queryClient,
      params.workspaceSlug,
      params.applicationRef,
      deps,
    );

    return { title: page.status === "ok" ? page.application.title : undefined };
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ loaderData, match: { context } }) => {
    const t = webTranslator(context.locale);
    return {
      meta: [
        {
          title: loaderData?.title
            ? t("common:pageTitle", { title: loaderData.title })
            : t("page.workspace"),
        },
      ],
    };
  },
  component: ApplicationPage,
  pendingComponent: () => <WorkspaceStatusPage resource="application" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="application" status="unavailable" />,
});
