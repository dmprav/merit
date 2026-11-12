import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { administratorInvitationState, type OrganizationSummary } from "@merit/organizations/api";
import { Badge } from "@merit/ui/badge";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Notice } from "@merit/ui/notice";

import type { Organization } from "../contracts";
import styles from "./organization.module.css";

type Invitation = Organization["invitation"];

export const invitationNeedsAttention = (
  invitation: OrganizationSummary["invitation"] | Invitation,
  hasOwner: boolean,
) => {
  const state = administratorInvitationState(invitation, new Date(), hasOwner);
  return (
    state === "needsAdmin" ||
    state === "expired" ||
    (state === "pending" && invitation?.delivery !== "sent")
  );
};

const tones = {
  needsAdmin: "warning",
  expired: "warning",
  pending: "neutral",
  joined: "success",
} as const;

export const invitationTimestamp = (date: Date | string, formatLocale: string) =>
  new Intl.DateTimeFormat(formatLocale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(date)) + " UTC";

export const InvitationBadge = ({
  invitation,
  hasOwner = false,
}: {
  invitation: OrganizationSummary["invitation"] | Invitation;
  hasOwner?: boolean;
}) => {
  const { t } = useTranslation("administration");
  const state = administratorInvitationState(invitation, new Date(), hasOwner);
  return <Badge tone={tones[state]}>{t(state)}</Badge>;
};

const InvitationRecord = ({ invitation }: { invitation: NonNullable<Invitation> }) => {
  const { t } = useTranslation("administration");
  const { formatLocale } = useLocaleSettings();

  return (
    <DescriptionList>
      <DescriptionListItem label={t(invitation.revokedAt ? "previousRecipient" : "recipient")}>
        {invitation.email}
      </DescriptionListItem>
      {invitation.acceptedAt ? (
        <DescriptionListItem label={t("acceptedLabel")}>
          {invitationTimestamp(invitation.acceptedAt, formatLocale)}
        </DescriptionListItem>
      ) : (
        !invitation.revokedAt && (
          <>
            <DescriptionListItem label={t("emailStatus")}>
              {t(
                invitation.delivery === "pending"
                  ? "deliveryPendingShort"
                  : invitation.delivery === "failed"
                    ? "deliveryFailedShort"
                    : "sent",
              )}
            </DescriptionListItem>
            <DescriptionListItem label={t("expiresLabel")}>
              {invitationTimestamp(invitation.expiresAt, formatLocale)}
            </DescriptionListItem>
          </>
        )
      )}
    </DescriptionList>
  );
};

export const InvitationSummary = ({
  invitation,
  hasOwner = false,
  showStatus = true,
}: {
  invitation: Invitation;
  hasOwner?: boolean;
  showStatus?: boolean;
}) => {
  const { t } = useTranslation("administration");
  const state = administratorInvitationState(invitation, new Date(), hasOwner);

  return (
    <div className={styles.stack}>
      {showStatus && (
        <div>
          <InvitationBadge invitation={invitation} hasOwner={hasOwner} />
        </div>
      )}
      {invitation && <InvitationRecord invitation={invitation} />}
      {state === "joined" ? (
        <p className={styles.muted}>{t("joinedHelp")}</p>
      ) : state === "needsAdmin" ? (
        <Notice tone="warning">{t("needsAdminHelp")}</Notice>
      ) : (
        <>
          {state === "expired" && <Notice tone="warning">{t("expiredHelp")}</Notice>}
          {invitation?.delivery === "failed" && <Notice tone="danger">{t("failed")}</Notice>}
          {invitation?.delivery === "pending" && (
            <Notice tone="neutral">{t("deliveryPending")}</Notice>
          )}
        </>
      )}
    </div>
  );
};
