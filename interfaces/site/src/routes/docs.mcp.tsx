import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { DocsLayout } from "../features/docs/docs-layout";
import { McpGuide } from "../features/docs/mcp-guide";

export const Route = createFileRoute("/docs/mcp")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.mcp.title") }) },
        { name: "description", content: t("docs.pages.mcp.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="mcp">
      <McpGuide />
    </DocsLayout>
  ),
});
