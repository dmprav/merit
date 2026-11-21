import { useTranslation } from "react-i18next";

import { PageHeader } from "@merit/ui/page-header";

import { AdminPageState } from "../../shared/admin-page-state";
import { RoutedLink } from "../../shared/routed-link";
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
          <RoutedLink to="/admin/organizations/$organizationId" params={{ organizationId: org.id }}>
            {org.name}
          </RoutedLink>
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
