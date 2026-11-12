import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { TeamGuide } from "../features/docs/team-guide";

export const Route = createFileRoute("/docs/team")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.team.title") }) },
        { name: "description", content: t("docs.pages.team.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="team">
      <TeamGuide />
    </DocsLayout>
  ),
});
