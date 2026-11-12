import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { WorkspaceGuide } from "../features/docs/workspace-guide";

export const Route = createFileRoute("/docs/workspaces")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.workspaces.title") }) },
        { name: "description", content: t("docs.pages.workspaces.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="workspaces">
      <WorkspaceGuide />
    </DocsLayout>
  ),
});
