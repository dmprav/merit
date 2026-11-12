import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { ApplicationGuide } from "../features/docs/application-guide";
import { DocsLayout } from "../features/docs/docs-layout";

export const Route = createFileRoute("/docs/applications")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.applications.title") }) },
        { name: "description", content: t("docs.pages.applications.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="applications">
      <ApplicationGuide />
    </DocsLayout>
  ),
});
