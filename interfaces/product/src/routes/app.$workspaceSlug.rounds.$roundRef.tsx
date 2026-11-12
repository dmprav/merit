import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { FundingRoundScreen } from "../app/funding-round-screens";
import { webTranslator } from "../app/messages";
import { WorkspaceStatusPage } from "../app/workspace-page";
import { publicIdFromRef } from "../features/grantmaking/contracts/resource-url";
import { useWorkspaceRoundData } from "../features/grantmaking/data/workspace-data";
import {
  loadPublicPage,
  workspaceRoundsLocation,
  applicationLocation,
} from "../features/grantmaking/page-routing";

const RoundPage = () => {
  const params = Route.useParams();
  const result = useWorkspaceRoundData(
    params.workspaceSlug,
    publicIdFromRef(params.roundRef) ?? "",
  );
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  if (result.status !== "ok") {
    return <WorkspaceStatusPage resource="round" status={result.status} />;
  }

  const roundsLocation = workspaceRoundsLocation(params.workspaceSlug);
  const page = { workspaceSlug: result.workspaceSlug, round: result.data.round };

  return (
    <FundingRoundScreen
      data={result.data}
      roundsLocation={roundsLocation}
      section={search.section}
      onSectionChange={(section) => {
        void navigate({
          search: { section: section === "applications" ? "applications" : undefined },
          replace: true,
          resetScroll: false,
        });
      }}
      renderReviewLink={(application, children) => (
        <Link {...applicationLocation(page, application.id)!} search={{ tab: "reviews" }}>
          {children}
        </Link>
      )}
      renderApplicationLink={(application) => (
        <Link {...applicationLocation(page, application.id)!}>{application.title}</Link>
      )}
    />
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/rounds/$roundRef")({
  validateSearch: (search: Record<string, unknown>): { section?: "overview" | "applications" } => ({
    section:
      search.section === "applications"
        ? "applications"
        : search.section === "overview" || search.section === "details"
          ? "overview"
          : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, context }) => {
    const page = await loadPublicPage(
      context.queryClient,
      params.workspaceSlug,
      params.roundRef,
      deps,
    );

    return { title: page.status === "ok" ? page.round.title : undefined };
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
            : t("page.round"),
        },
      ],
    };
  },
  component: RoundPage,
  pendingComponent: () => <WorkspaceStatusPage resource="round" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="round" status="unavailable" />,
});
