import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import linkStyles from "@merit/ui/link.module.css";
import { PageHeader } from "@merit/ui/page-header";

import { AdminPageState } from "../../shared/admin-page-state";
import type { Organization, ReadResult, ListResult } from "./contracts";
import { useAdminDrafts } from "./controllers/drafts";
import { CreateOrganization } from "./create-organization";
import { useOrganizationData } from "./data/organization";
import { OrganizationDetailsView } from "./views/organization-details";
import { OrganizationsTable } from "./views/organizations-table";

export const OrganizationList = ({ result }: { result: ListResult }) => {
  const { t } = useTranslation("administration");
  const drafts = useAdminDrafts();
  if (result.status !== "ok") {
    return <AdminPageState status={result.status} returnTo="/admin/organizations" />;
  }

  return (
    <>
      <PageHeader title={t("organizations")} actions={<CreateOrganization />} />
      <OrganizationsTable
        organizations={result.value}
        view={drafts.listView}
        onViewChange={drafts.setListView}
        renderLink={(org) => (
          <Link
            to="/admin/organizations/$organizationId"
            params={{ organizationId: org.id }}
            className={linkStyles.text}
          >
            {org.name}
          </Link>
        )}
      />
    </>
  );
};

export const OrganizationDetails = ({ result }: { result: ReadResult }) => {
  if (result.status !== "ok") {
    return <AdminPageState status={result.status} returnTo="/admin/organizations" />;
  }
  return <Details key={result.value.id} initial={result.value} />;
};

const Details = ({ initial }: { initial: Organization }) => {
  const data = useOrganizationData(initial);
  return <OrganizationDetailsView data={data} />;
};
