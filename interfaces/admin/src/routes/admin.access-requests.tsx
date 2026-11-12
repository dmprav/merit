import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { adminTranslator } from "../app/messages";
import { AccessRequests } from "../features/access-requests/access-requests";
import { accessRequestsOptions } from "../features/access-requests/data/queries";
import { AdminPageState } from "../shared/admin-page-state";

const AccessRequestsPage = () => (
  <AccessRequests result={useSuspenseQuery(accessRequestsOptions()).data} />
);

export const Route = createFileRoute("/_administration/admin/access-requests")({
  loader: async ({ context }) => {
    await context.queryClient.fetchQuery(accessRequestsOptions());
  },
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => ({
    meta: [{ title: adminTranslator(context.locale)("page.accessRequests") }],
  }),
  component: AccessRequestsPage,
  pendingComponent: () => <AdminPageState status="loading" returnTo="/admin/access-requests" />,
  errorComponent: () => <AdminPageState status="unavailable" returnTo="/admin/access-requests" />,
});
