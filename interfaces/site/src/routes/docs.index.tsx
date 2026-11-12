import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsHome } from "../features/docs/docs-home";
import { DocsLayout } from "../features/docs/docs-layout";

export const Route = createFileRoute("/docs/")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("docs.pages.overview.browserTitle") },
        { name: "description", content: t("docs.pages.overview.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="overview">
      <DocsHome />
    </DocsLayout>
  ),
});
