import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { QuickstartGuide } from "../features/docs/quickstart-guide";

export const Route = createFileRoute("/docs/quickstart")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.quickstart.title") }) },
        { name: "description", content: t("docs.pages.quickstart.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="quickstart">
      <QuickstartGuide />
    </DocsLayout>
  ),
});
