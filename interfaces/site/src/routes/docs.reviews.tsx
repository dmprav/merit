import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { ReviewerGuide } from "../features/docs/reviewer-guide";

export const Route = createFileRoute("/docs/reviews")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.reviews.title") }) },
        { name: "description", content: t("docs.pages.reviews.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="reviews">
      <ReviewerGuide />
    </DocsLayout>
  ),
});
