import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Contact, ContactsData } from "../contracts";
import { contactsOptions } from "./queries";
import { useContactsSource } from "./source";

export const useWorkspaceContacts = (
  workspaceSlug: string,
  initial: Contact[] = [],
): ContactsData => {
  const client = useQueryClient();
  const source = useContactsSource();
  const options = contactsOptions(workspaceSlug, source);
  const query = useQuery(options);
  const mutation = useMutation({ mutationFn: source.save });

  return {
    contacts:
      query.data?.status === "ok"
        ? query.data.contacts.map((contact) => ({
            ...contact,
            historySource: source.history?.(workspaceSlug, contact),
          }))
        : initial,
    readFailed: query.isError,
    refreshCurrent: async () => {
      await client.invalidateQueries({ queryKey: options.queryKey }, { throwOnError: true });
    },
    refresh: async () => {
      await client.invalidateQueries(
        { queryKey: source.scope(workspaceSlug) },
        { throwOnError: true },
      );
    },
    save: async (input) => {
      const result = await mutation.mutateAsync(input);
      if (result.status === "ok") {
        await client.cancelQueries({ queryKey: options.queryKey });
        client.setQueryData(options.queryKey, (old) =>
          old?.status === "ok"
            ? {
                ...old,
                contacts: [
                  ...old.contacts.filter((item) => item.id !== result.contact.id),
                  {
                    ...result.contact,
                    applicationTitles:
                      old.contacts.find((item) => item.id === result.contact.id)
                        ?.applicationTitles ?? [],
                  },
                ],
              }
            : old,
        );
        await client.invalidateQueries({
          queryKey: source.scope(workspaceSlug),
          refetchType: "none",
        });
      }

      return result;
    },
  };
};
