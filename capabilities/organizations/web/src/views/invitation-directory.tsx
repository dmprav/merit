import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { permits } from "@merit/access";
import { useLocaleSettings } from "@merit/i18n";
import type { Team } from "@merit/organizations/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { ActionMenu } from "@merit/ui/action-menu";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { PersonIdentity } from "@merit/ui/person-identity";

import styles from "./team-view.module.css";

type Invitation = Team["invitations"][number];

type DirectoryProps = {
  team: Team;
  isDisabled: boolean;
  onResend: (invitation: Invitation, trigger: HTMLButtonElement | null) => void;
  onRevoke: (invitation: Invitation, trigger: HTMLButtonElement | null) => void;
};

const InvitationActions = ({
  invitation,
  isDisabled,
  onResend,
  onRevoke,
}: Pick<DirectoryProps, "isDisabled" | "onResend" | "onRevoke"> & { invitation: Invitation }) => {
  const { t } = useTranslation("team");
  const trigger = useRef<HTMLButtonElement>(null);
  const label = t("invitationActions", { email: invitation.email });

  return (
    <ActionMenu
      label={label}
      trigger={
        <Button
          ref={trigger}
          variant="quiet"
          size="small"
          iconOnly
          isDisabled={isDisabled}
          aria-label={label}
        >
          <Icon name="more" />
        </Button>
      }
      items={[
        { id: "resend", label: t("resend") },
        { id: "revoke", label: t("revoke") },
      ]}
      onAction={(action) =>
        action === "resend"
          ? onResend(invitation, trigger.current)
          : onRevoke(invitation, trigger.current)
      }
    />
  );
};

type InvitationRow = Pick<DirectoryProps, "isDisabled" | "onResend" | "onRevoke"> & {
  invitation: Invitation;
  canManage: boolean;
};

const InvitationIdentityCell = (props: InvitationRow) => {
  const { invitation, canManage, isDisabled, onResend } = props;
  const { t } = useTranslation("team");
  const { formatLocale } = useLocaleSettings();
  const expired = new Date(invitation.expiresAt) <= new Date();
  const failed = invitation.delivery === "failed";
  const date = new Date(invitation.expiresAt).toLocaleDateString(formatLocale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <PersonIdentity
      name={invitation.email}
      description={
        <span className={styles.invitationDetails}>
          {failed && (
            <span>
              <Badge tone="danger">{t("delivery_failed")}</Badge>
            </span>
          )}
          <span className={styles.invitationState}>
            <Badge tone={expired ? "warning" : "neutral"}>
              {t(expired ? "expired" : "pending")}
            </Badge>
            <span>{t(expired ? "expiredOn" : "expires", { date })}</span>
          </span>
          {!failed && <span>{t(`delivery_${invitation.delivery}`)}</span>}
          {canManage && (failed || expired) && (
            <Button
              variant="quiet"
              size="small"
              className={styles.invitationResend}
              isDisabled={isDisabled}
              aria-label={t("resendTo", { email: invitation.email })}
              onPress={(event) => onResend(invitation, event.target as HTMLButtonElement)}
            >
              {t("resend")}
            </Button>
          )}
        </span>
      }
    />
  );
};

export const InvitationDirectory = (props: DirectoryProps) => {
  const { team } = props;
  const { t } = useTranslation("team");

  const columns: TableColumn<InvitationRow>[] = [
    {
      id: "person",
      header: t("recipient"),
      layout: { width: "48%" },
      cell: (record) => <InvitationIdentityCell {...record} />,
    },
    {
      id: "administration",
      header: t("administration"),
      layout: { width: "22%" },
      cell: ({ invitation }) => <>{t(invitation.administration)}</>,
    },
    {
      id: "role",
      header: t("grantAccess"),
      layout: { width: "22%" },
      cell: ({ invitation }) => <>{t(invitation.role)}</>,
    },
    {
      id: "actions",
      header: t("actions"),
      layout: { width: "3rem", align: "end", rowActions: true },
      cell: (record) => (record.canManage ? <InvitationActions {...record} /> : null),
    },
  ];

  return (
    <DataTable
      data={team.invitations.map((invitation) => ({
        invitation,
        canManage: permits(team.subject, "manage_invitation", {
          organizationId: team.organization.id,
          administration: invitation.administration,
        }),
        isDisabled: props.isDisabled,
        onResend: props.onResend,
        onRevoke: props.onRevoke,
      }))}
      columns={columns}
      // Resending replaces the invitation; the recipient remains the same row.
      getRowId={(row) => row.invitation.email}
      label={t("invitations")}
      emptyMessage={t("noInvitations")}
    />
  );
};
