import type { ComponentProps, ReactNode } from "react";

import { useWorkspaceContacts } from "./data/workspace-data";
import { ContactPicker as Picker } from "./views/contact-picker";
import { ContactsDirectory as Directory } from "./views/contacts-directory";

export const ContactPicker = (props: Omit<ComponentProps<typeof Picker>, "data">) => {
  const data = useWorkspaceContacts(props.workspaceSlug);
  return <Picker {...props} data={data} />;
};

export const ContactsDirectory = (props: Omit<ComponentProps<typeof Directory>, "data">) => {
  const data = useWorkspaceContacts(props.workspaceSlug, props.contacts);
  return <Directory {...props} contacts={data.contacts} data={data} />;
};

/** Resolves a saved selection for read-only comparisons; the caller names an unavailable selection. */
export const ContactLabel = ({
  workspaceSlug,
  contactId,
  fallback,
}: {
  workspaceSlug: string;
  contactId: string;
  fallback: ReactNode;
}) => {
  const data = useWorkspaceContacts(workspaceSlug);
  const contact = data.contacts.find((item) => item.id === contactId);
  return contact?.name || contact?.email || fallback;
};
