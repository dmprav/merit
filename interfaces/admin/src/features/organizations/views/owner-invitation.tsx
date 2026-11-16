import { useTranslation } from "react-i18next";

import { administratorInvitationState, type OrganizationSummary } from "@merit/organizations/api";
import { Badge } from "@merit/ui/badge";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import { Timestamp } from "@merit/ui/timestamp";

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

const invitationPresentation = {
  needsAdmin: { label: "needsAdmin", tone: "warning", icon: "warning" },
  expired: { label: "expired", tone: "warning", icon: "warning" },
  pending: { label: "pending", tone: "neutral", icon: "clock" },
  joined: { label: "joined", tone: "success", icon: "check" },
  failed: { label: "deliveryFailedShort", tone: "danger", icon: "warning" },
  unconfirmed: { label: "deliveryPendingShort", tone: "warning", icon: "info" },
} as const;

export const InvitationBadge = ({
  invitation,
  hasOwner = false,
  appearance,
}: {
  invitation: OrganizationSummary["invitation"] | Invitation;
  hasOwner?: boolean;
  appearance?: "plain";
}) => {
  const { t } = useTranslation("administration");
  const state = administratorInvitationState(invitation, new Date(), hasOwner);
  const delivery = appearance === "plain" && state === "pending" ? invitation?.delivery : undefined;
  const presentation =
    invitationPresentation[
      delivery === "failed" ? "failed" : delivery === "pending" ? "unconfirmed" : state
    ];
  return (
    <Badge appearance={appearance} tone={presentation.tone}>
      {appearance === "plain" && <Icon name={presentation.icon} />}
      {t(presentation.label)}
    </Badge>
  );
};

const InvitationRecord = ({ invitation }: { invitation: NonNullable<Invitation> }) => {
  const { t } = useTranslation("administration");

  return (
    <DescriptionList>
      <DescriptionListItem label={t(invitation.revokedAt ? "previousRecipient" : "recipient")}>
        {invitation.email}
      </DescriptionListItem>
      {invitation.acceptedAt ? (
        <DescriptionListItem label={t("acceptedLabel")}>
          <Timestamp value={new Date(invitation.acceptedAt).toISOString()} />
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
              <Timestamp value={new Date(invitation.expiresAt).toISOString()} />
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
