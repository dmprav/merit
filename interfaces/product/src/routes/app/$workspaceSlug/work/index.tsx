import { createFileRoute } from "@tanstack/react-router";

import { webTranslator } from "../../../../app/messages";
import { reviewerListOptions } from "../../../../features/grantmaking/data/reviews/reviewer-data";
import { MyWorkPage, ReviewerUnavailable } from "../../../../features/grantmaking/reviewer-page";

const Page = () => <MyWorkPage workspaceSlug={Route.useParams().workspaceSlug} />;

export const Route = createFileRoute("/_product/app/$workspaceSlug/work/")({
  loader: ({ params, context }) =>
    context.queryClient.fetchQuery(reviewerListOptions(params.workspaceSlug)),
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return { meta: [{ title: t("common:pageTitle", { title: t("navigation.myWork") }) }] };
  },
  staleTime: 0,
  gcTime: 0,
  component: Page,
  errorComponent: () => <ReviewerUnavailable />,
});
