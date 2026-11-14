import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { StateMessage } from "@merit/ui/state-message";

import { webTranslator } from "../../app/messages";
import { RouteRetry } from "../../components/route-retry";
import { StandalonePage } from "../../components/standalone-page";
import { invitationOptions, invitationFingerprint } from "../../features/workspace/data/queries";
import { WorkspaceInvitation } from "../../features/workspace/invitation";

const Invitation = () => {
  const { token } = Route.useParams();
  const fingerprint = Route.useLoaderData();
  return <WorkspaceInvitation token={token} fingerprint={fingerprint} />;
};

const InvitationPending = () => {
  const { t } = useTranslation("onboarding");
  return (
    <StandalonePage>
      <StateMessage title={t("loading")} />
    </StandalonePage>
  );
};

const InvitationError = () => {
  const { t } = useTranslation("onboarding");
  return (
    <StandalonePage>
      <StateMessage
        title={t("invitationUnavailable")}
        actions={<RouteRetry>{t("retry")}</RouteRetry>}
      />
    </StandalonePage>
  );
};

export const Route = createFileRoute("/_product/invitations/$token")({
  loader: async ({ params, context }) => {
    const fingerprint = await invitationFingerprint(params.token);
    await context.queryClient.fetchQuery(invitationOptions(params.token, fingerprint));
    return fingerprint;
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return {
      meta: [
        { title: t("common:pageTitle", { title: t("onboarding:invitation") }) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: Invitation,
  pendingComponent: InvitationPending,
  errorComponent: InvitationError,
});
