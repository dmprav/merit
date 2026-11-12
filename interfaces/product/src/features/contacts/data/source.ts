import type { ContactsSource } from "@merit/contacts-web/contracts";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { readContacts, saveContact } from "./server/contacts.functions";

export const contactsSource: ContactsSource = {
  scope: grantWorkQueryKey,
  read: (workspaceSlug, signal) => readContacts({ data: { workspaceSlug }, signal }),
  save: (data) => saveContact({ data }),
};
