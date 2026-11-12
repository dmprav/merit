import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { RecommendationGuide } from "../features/docs/recommendation-guide";

export const Route = createFileRoute("/docs/recommendations")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.recommendations.title") }) },
        { name: "description", content: t("docs.pages.recommendations.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="recommendations">
      <RecommendationGuide />
    </DocsLayout>
  ),
});
