import { createFileRoute } from "@tanstack/react-router";

import { siteTranslator } from "../app/messages";
import { SiteShell } from "../app/site-shell";
import { LandingPage } from "../features/landing/landing-page";

export const Route = createFileRoute("/")({
  head: ({ match: { context } }) => {
    const t = siteTranslator(context.locale);
    return {
      meta: [{ title: t("page.home") }, { name: "description", content: t("hero.description") }],
    };
  },
  component: () => (
    <SiteShell>
      <LandingPage />
    </SiteShell>
  ),
});
