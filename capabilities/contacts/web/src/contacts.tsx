import type { ComponentProps } from "react";

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
