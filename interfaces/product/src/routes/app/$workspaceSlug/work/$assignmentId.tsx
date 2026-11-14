import { createFileRoute } from "@tanstack/react-router";

import { webTranslator } from "../../../../app/messages";
import { reviewerPageOptions } from "../../../../features/grantmaking/data/reviews/reviewer-data";
import {
  ReviewerAssignmentPage,
  ReviewerUnavailable,
} from "../../../../features/grantmaking/reviewer-page";

const Page = () => <ReviewerAssignmentPage {...Route.useParams()} />;

export const Route = createFileRoute("/_product/app/$workspaceSlug/work/$assignmentId")({
  loader: ({ params, context }) =>
    context.queryClient.fetchQuery(reviewerPageOptions(params.assignmentId, params.workspaceSlug)),
  headers: () => ({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }),
  head: ({ loaderData, match: { context } }) => {
    const t = webTranslator(context.locale);
    return {
      meta: [
        {
          title: t("common:pageTitle", {
            title:
              loaderData?.status === "ok"
                ? loaderData.value.assignment.applicationTitle
                : t("navigation.myWork"),
          }),
        },
      ],
    };
  },
  staleTime: 0,
  gcTime: 0,
  component: Page,
  errorComponent: () => <ReviewerUnavailable />,
});
