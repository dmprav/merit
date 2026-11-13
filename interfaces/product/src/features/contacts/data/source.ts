import type { ContactsSource } from "@merit/contacts-web/contracts";
import { available } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { readContacts, saveContact, readContactHistory } from "./server/contacts.functions";

export const contactsSource: ContactsSource = {
  scope: grantWorkQueryKey,
  history: (workspaceSlug, contact) => ({
    queryKey: [
      ...grantWorkQueryKey(workspaceSlug),
      "contacts",
      contact.id,
      "history",
      contact.revision,
    ],
    read: async (after, signal) => {
      const result = available(
        await readContactHistory({ data: { workspaceSlug, contactId: contact.id, after }, signal }),
      );
      return result.status === "ok" ? result : null;
    },
  }),
  read: (workspaceSlug, signal) => readContacts({ data: { workspaceSlug }, signal }),
  save: (data) => saveContact({ data }),
};
