import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { SiteShell } from "../app/site-shell";
import { PrivacyPage } from "../features/privacy/privacy-page";

export const Route = createFileRoute("/privacy")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [
        { title: t("privacy.browserTitle") },
        { name: "description", content: t("privacy.description") },
      ],
    };
  },
  component: () => (
    <SiteShell>
      <PrivacyPage />
    </SiteShell>
  ),
});
