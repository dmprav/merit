import type { ReactNode } from "react";

import { ContactsProvider } from "@merit/contacts-web/provider";

import { contactsSource } from "./data/source";

export const WorkspaceContacts = ({ children }: { children: ReactNode }) => (
  <ContactsProvider source={contactsSource}>{children}</ContactsProvider>
);
