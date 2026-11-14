import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Inline, Stack } from "@merit/ui/layout";
import linkStyles from "@merit/ui/link.module.css";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { StateMessage } from "@merit/ui/state-message";

import { RouteRetry } from "../../../components/route-retry";
import { StandalonePage } from "../../../components/standalone-page";
import type { InvitationResult } from "../contracts";

/** Invitation responsibilities and recovery, independent of loading and acceptance transport. */
export const InvitationView = ({
  result,
  token,
  pending = false,
  error = "",
  onAccept,
}: {
  result: InvitationResult;
  token: string;
  pending?: boolean;
  error?: string;
  onAccept: () => void;
}) => {
  const { t } = useTranslation("onboarding");

  return (
    <StandalonePage>
      {result.status === "ok" ? (
        <InvitationDetails
          invitation={result.value}
          pending={pending}
          error={error}
          onAccept={onAccept}
        />
      ) : (
        <StateMessage
          title={t(invitationTitle(result.status))}
          description={
            result.status === "signed_out" ? t("signInDescription") : t(`errors.${result.status}`)
          }
          actions={
            <Inline gap={3}>
              {["signed_out", "wrong_account"].includes(result.status) ? (
                <Link
                  to="/app/sign-in"
                  search={{ returnTo: `/invitations/${token}` }}
                  className={linkStyles.button}
                  data-variant="primary"
                >
                  {t(result.status === "signed_out" ? "signIn" : "switchAccount")}
                </Link>
              ) : result.status === "unavailable" ? (
                <RouteRetry>{t("retry")}</RouteRetry>
              ) : (
                <Link to="/app" className={`${linkStyles.text} ${linkStyles.standalone}`}>
                  {t("back")}
                </Link>
              )}
            </Inline>
          }
        />
      )}
    </StandalonePage>
  );
};

const InvitationDetails = ({
  invitation,
  pending,
  error,
  onAccept,
}: {
  invitation: Extract<InvitationResult, { status: "ok" }>["value"];
  pending: boolean;
  error: string;
  onAccept: () => void;
}) => {
  const { t } = useTranslation("onboarding");

  return (
    <>
      <PageHeader
        title={invitation.organization.name}
        kicker={t("invitation")}
        description={t("invitationDescription", {
          organization: invitation.organization.name,
        })}
      />
      <Stack gap={5}>
        <DescriptionList>
          <DescriptionListItem label={t(`responsibility.${invitation.administration}.label`)}>
            {t(`responsibility.${invitation.administration}.description`)}
          </DescriptionListItem>
          <DescriptionListItem
            label={t(
              invitation.role === "reviewer"
                ? "reviewerAccess.label"
                : invitation.role === "program_manager"
                  ? "grantAccess.label"
                  : "noGrantAccessLabel",
            )}
          >
            {t(
              invitation.role === "reviewer"
                ? "reviewerAccess.description"
                : invitation.role === "program_manager"
                  ? "grantAccess.description"
                  : "noGrantAccess",
            )}
          </DescriptionListItem>
        </DescriptionList>
        {invitation.accepted && <p>{t("accepted")}</p>}
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
        <Button isPending={pending} onPress={onAccept}>
          {t(pending ? "accepting" : invitation.accepted ? "continue" : "accept")}
        </Button>
      </Stack>
    </>
  );
};

const invitationTitle = (status: string) => {
  switch (status) {
    case "signed_out":
    case "expired":
    case "revoked":
    case "wrong_account":
      return `invitationTitles.${status}` as const;
    default:
      return "invitationUnavailable";
  }
};
