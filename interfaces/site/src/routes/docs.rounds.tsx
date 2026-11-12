import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { RoundGuide } from "../features/docs/round-guide";

export const Route = createFileRoute("/docs/rounds")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.rounds.title") }) },
        { name: "description", content: t("docs.pages.rounds.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="rounds">
      <RoundGuide />
    </DocsLayout>
  ),
});
