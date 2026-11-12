import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { adminTranslator } from "../app/messages";
import { organizationOptions } from "../features/organizations/data/queries";
import { OrganizationDetails } from "../features/organizations/screens";
import { AdminPageState } from "../shared/admin-page-state";

const OrganizationPage = () => (
  <OrganizationDetails
    result={useSuspenseQuery(organizationOptions(Route.useParams().organizationId)).data}
  />
);

export const Route = createFileRoute("/_administration/admin/organizations/$organizationId")({
  loader: async ({ params, context }) => {
    await context.queryClient.fetchQuery(organizationOptions(params.organizationId));
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => ({
    meta: [{ title: adminTranslator(context.locale)("page.organization") }],
  }),
  component: OrganizationPage,
  pendingComponent: () => <AdminPageState status="loading" returnTo="/admin/organizations" />,
  errorComponent: () => <AdminPageState status="unavailable" returnTo="/admin/organizations" />,
});
