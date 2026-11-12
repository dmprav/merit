import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { ContactGuide } from "../features/docs/contact-guide";
import { DocsLayout } from "../features/docs/docs-layout";

export const Route = createFileRoute("/docs/contacts")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("docs.pages.contacts.title") }) },
        { name: "description", content: t("docs.pages.contacts.description") },
      ],
    };
  },
  component: () => (
    <DocsLayout page="contacts">
      <ContactGuide />
    </DocsLayout>
  ),
});
