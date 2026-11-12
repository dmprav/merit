import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { adminTranslator } from "../app/messages";
import { organizationsOptions } from "../features/organizations/data/queries";
import { OrganizationList } from "../features/organizations/screens";
import { AdminPageState } from "../shared/admin-page-state";

const OrganizationsPage = () => (
  <OrganizationList result={useSuspenseQuery(organizationsOptions()).data} />
);

export const Route = createFileRoute("/_administration/admin/organizations/")({
  loader: async ({ context }) => {
    await context.queryClient.fetchQuery(organizationsOptions());
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => ({
    meta: [{ title: adminTranslator(context.locale)("page.organizations") }],
  }),
  component: OrganizationsPage,
  pendingComponent: () => <AdminPageState status="loading" returnTo="/admin/organizations" />,
  errorComponent: () => <AdminPageState status="unavailable" returnTo="/admin/organizations" />,
});
