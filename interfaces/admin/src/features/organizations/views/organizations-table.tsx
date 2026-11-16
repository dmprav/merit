import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { administratorInvitationState, type OrganizationSummary } from "@merit/organizations/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { StateMessage } from "@merit/ui/state-message";
import { Timestamp } from "@merit/ui/timestamp";

import type { OrganizationListView } from "../controllers/drafts";
import styles from "./organization.module.css";
import { InvitationBadge } from "./owner-invitation";

type OrganizationsTableProps = {
  organizations: OrganizationSummary[];
  view: OrganizationListView;
  onViewChange: (view: OrganizationListView) => void;
  renderLink: (organization: OrganizationSummary) => ReactNode;
};

export const OrganizationsTable = ({
  organizations,
  renderLink,
  view,
  onViewChange,
}: OrganizationsTableProps) => {
  const { t } = useTranslation("administration");
  const columns = useOrganizationColumns(renderLink);
  if (!organizations.length) {
    return <StateMessage title={t("noOrganizations")} description={t("emptyDescription")} />;
  }

  return (
    <DataTable
      data={organizations}
      density="compact"
      columns={columns}
      getRowId={(org) => org.id}
      label={t("organizations")}
      emptyMessage={t("noOrganizations")}
      sorting={{
        value: view.sorting,
        onChange: (sorting) => onViewChange({ ...view, sorting }),
        labels: {
          by: t("sortBy"),
          original: t("originalOrder"),
          ascending: t("ascending"),
          descending: t("descending"),
        },
      }}
    />
  );
};

const useOrganizationColumns = (renderLink: OrganizationsTableProps["renderLink"]) => {
  const { t } = useTranslation("administration");
  const { formatLocale } = useLocaleSettings();
  const columns: TableColumn<OrganizationSummary>[] = [
    {
      id: "organization",
      header: t("organization"),
      sort: {
        value: (org) => org.name,
        compare: (a, b) => a.name.localeCompare(b.name, formatLocale),
      },
      layout: { width: "42%", primary: true },
      cell: (org) => (
        <div className={styles.cell}>
          <strong>{renderLink(org)}</strong>
          <span className={styles.muted}>{org.slug}</span>
        </div>
      ),
    },
    {
      id: "invitation",
      header: t("invitation"),
      layout: { width: "22%" },
      cell: (org) => (
        <InvitationBadge appearance="plain" invitation={org.invitation} hasOwner={org.hasOwner} />
      ),
    },
    {
      id: "recipient",
      header: t("recipient"),
      layout: { width: "24%" },
      cell: (org) => (
        <span className={styles.muted}>{org.invitation?.email ?? t("noRecipient")}</span>
      ),
    },
    {
      id: "expires",
      header: t("expiresLabel"),
      layout: { width: "12rem" },
      cell: (org) => {
        const state = administratorInvitationState(org.invitation, new Date(), org.hasOwner);
        return org.invitation && (state === "pending" || state === "expired") ? (
          <Timestamp value={new Date(org.invitation.expiresAt).toISOString()} />
        ) : (
          <span className={styles.muted}>—</span>
        );
      },
    },
  ];
  return columns;
};
