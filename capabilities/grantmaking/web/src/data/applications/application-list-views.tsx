import { createContext, useContext, useState, type ReactNode } from "react";

import type { ApplicationFilter } from "@merit/grantmaking/api";
import type { TableSort } from "@merit/tables";

type ListState = {
  query: string;
  filter: ApplicationFilter;
  sorting: TableSort;
  page?: { scope: string; offset: number };
};

const empty: ListState = { query: "", filter: {}, sorting: null };
const Context = createContext<{
  lists: Record<string, ListState | undefined>;
  update: (key: string, value: Partial<ListState>) => void;
} | null>(null);

/** Account-session preferences; fetched pages remain with the query adapter. */
export const ApplicationListViews = ({ children }: { children: ReactNode }) => {
  const [lists, setLists] = useState<Record<string, ListState | undefined>>({});
  return (
    <Context
      value={{
        lists,
        update: (key, value) =>
          setLists((current) => ({
            ...current,
            [key]: { ...(current[key] ?? empty), ...value },
          })),
      }}
    >
      {children}
    </Context>
  );
};

export const useApplicationListView = (key: string) => {
  const context = useContext(Context);
  if (!context) {
    throw new Error("ApplicationListViews is required");
  }
  const state = context.lists[key] ?? empty;
  return {
    ...state,
    scope: key,
    onQueryChange: (query: string) => context.update(key, { query }),
    onFilterChange: (filter: ApplicationFilter) => context.update(key, { filter }),
    onSortingChange: (sorting: TableSort) => context.update(key, { sorting }),
    onPageChange: (page: NonNullable<ListState["page"]>) => context.update(key, { page }),
  };
};
