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

const InvitationStatus = ({ invitation }: { invitation: Invitation }) => {
  const { t } = useTranslation("team");
  // Show the next actionable state; delivery and acceptance remain distinct in the record.
  const status =
    new Date(invitation.expiresAt) <= new Date()
      ? "expired"
      : invitation.delivery === "sent"
        ? "pending"
        : (`delivery_${invitation.delivery}` as const);
  const failed = status === "delivery_failed";
  const uncertain = status === "delivery_pending";
  return (
    <Badge
      appearance="plain"
      tone={failed ? "danger" : status === "expired" || uncertain ? "warning" : "neutral"}
    >
      <Icon name={failed ? "warning" : uncertain ? "info" : "clock"} />
      {t(status)}
    </Badge>
  );
};

const InvitationExpiry = ({ invitation }: { invitation: Invitation }) => {
  const { formatLocale } = useLocaleSettings();
  const date = new Date(invitation.expiresAt);
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString(formatLocale, {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </time>
  );
};

export const InvitationDirectory = (props: DirectoryProps) => {
  const { team } = props;
  const { t } = useTranslation("team");

  const columns: TableColumn<InvitationRow>[] = [
    {
      id: "person",
      header: t("recipient"),
      cell: ({ invitation }) => <PersonIdentity name={invitation.email} />,
    },
    {
      id: "administration",
      header: t("administration"),
      layout: { width: "16%" },
      cell: ({ invitation }) => <>{t(invitation.administration)}</>,
    },
    {
      id: "role",
      header: t("grantAccess"),
      layout: { width: "16%" },
      cell: ({ invitation }) => <>{t(invitation.role)}</>,
    },
    {
      id: "status",
      header: t("status"),
      layout: { width: "20%" },
      cell: ({ invitation }) => <InvitationStatus invitation={invitation} />,
    },
    {
      id: "expires",
      header: t("expiry"),
      layout: { width: "8rem" },
      cell: ({ invitation }) => <InvitationExpiry invitation={invitation} />,
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
