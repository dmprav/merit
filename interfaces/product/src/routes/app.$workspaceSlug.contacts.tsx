import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppPage } from "../app/app-shell";
import { webTranslator } from "../app/messages";
import { WorkspaceStatusPage } from "../app/workspace-page";
import { ContactsDirectory } from "../features/contacts/contacts";
import { contactsOptions } from "../features/contacts/data/queries";

const ContactsPage = () => {
  const { t } = useTranslation("contacts");
  const { workspaceSlug } = Route.useParams();
  const { data } = useSuspenseQuery(contactsOptions(workspaceSlug));
  if (data.status !== "ok") {
    return <WorkspaceStatusPage resource="contacts" status={data.status} />;
  }

  return (
    <AppPage breadcrumb={[t("contacts")]}>
      <ContactsDirectory workspaceSlug={workspaceSlug} contacts={data.contacts} />
    </AppPage>
  );
};

export const Route = createFileRoute("/_product/app/$workspaceSlug/contacts")({
  loader: ({ params, context }) =>
    context.queryClient.fetchQuery(contactsOptions(params.workspaceSlug)),
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return { meta: [{ title: t("common:pageTitle", { title: t("contacts:contacts") }) }] };
  },
  pendingComponent: () => <WorkspaceStatusPage resource="contacts" status="loading" />,
  errorComponent: () => <WorkspaceStatusPage resource="contacts" status="unavailable" />,
  component: ContactsPage,
});
