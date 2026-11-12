import { queryOptions } from "@tanstack/react-query";

import { available } from "@merit/query";

import type { ContactsSource } from "../contracts";

export const contactsOptions = (workspaceSlug: string, source: ContactsSource) =>
  queryOptions({
    queryKey: [...source.scope(workspaceSlug), "contacts"],
    queryFn: async ({ signal }) => available(await source.read(workspaceSlug, signal)),
  });
