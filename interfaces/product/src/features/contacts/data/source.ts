import type { ContactsSource } from "@merit/contacts-web/contracts";
import { available } from "@merit/query";

import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { readContacts, saveContact, readContactApplications } from "./server/contacts.functions";

export const contactsSource: ContactsSource = {
  scope: grantWorkQueryKey,
  applications: (workspaceSlug, contact) => ({
    queryKey: [...grantWorkQueryKey(workspaceSlug), "contacts", contact.id, "applications"],
    read: async (after, signal) => {
      const result = available(
        await readContactApplications({
          data: { workspaceSlug, contactId: contact.id, after },
          signal,
        }),
      );
      return result.status === "ok"
        ? {
            entries: result.applications.map((application) => ({
              publicId: application.applicationId,
              title: application.title,
              roundTitle: application.roundTitle,
              relationships: application.relationships,
            })),
            nextCursor: result.nextCursor,
          }
        : null;
    },
  }),
  read: (workspaceSlug, signal) => readContacts({ data: { workspaceSlug }, signal }),
  save: (data) => saveContact({ data }),
};
