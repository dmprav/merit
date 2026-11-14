import { createContext, useContext, useState, type ReactNode } from "react";

import type { TableSort } from "@merit/tables";

import type { ApplicationFilter } from "./application-list-filter";

const Context = createContext<{
  sorting: Record<string, TableSort | undefined>;
  filters: Record<string, { query: string; filter: ApplicationFilter } | undefined>;
  workspaceQueries: Record<string, string | undefined>;
  setFilters: (roundId: string, value: { query: string; filter: ApplicationFilter }) => void;
  setSorting: (roundId: string, value: TableSort) => void;
  setWorkspaceQuery: (workspaceSlug: string, query: string) => void;
} | null>(null);

/** Keep each round's and workspace overview's list search, filter, and order for this account session, without persisting it to storage. */
export const ApplicationListViews = ({ children }: { children: ReactNode }) => {
  const [sorting, setSorting] = useState<Record<string, TableSort | undefined>>({});
  const [filters, setFilters] = useState<
    Record<string, { query: string; filter: ApplicationFilter } | undefined>
  >({});
  const [workspaceQueries, setWorkspaceQueries] = useState<Record<string, string | undefined>>({});

  return (
    <Context
      value={{
        sorting,
        filters,
        workspaceQueries,
        setFilters: (roundId, value) => setFilters((current) => ({ ...current, [roundId]: value })),
        setSorting: (roundId, value) =>
          setSorting((current) => ({
            ...current,
            [roundId]: value,
          })),
        setWorkspaceQuery: (workspaceSlug, query) =>
          setWorkspaceQueries((current) => ({ ...current, [workspaceSlug]: query })),
      }}
    >
      {children}
    </Context>
  );
};

export const useApplicationListView = (roundId: string) => {
  const context = useContext(Context);
  if (!context) {
    throw new Error("ApplicationListViews is required");
  }

  return {
    query: context.filters[roundId]?.query ?? "",
    filter: context.filters[roundId]?.filter ?? "all",
    onFilterChange: (value: { query: string; filter: ApplicationFilter }) =>
      context.setFilters(roundId, value),
    sorting: context.sorting[roundId] ?? null,
    onSortingChange: (value: TableSort) => context.setSorting(roundId, value),
  };
};

export const useWorkspaceApplicationList = (workspaceSlug: string) => {
  const context = useContext(Context);
  if (!context) {
    throw new Error("ApplicationListViews is required");
  }

  return {
    query: context.workspaceQueries[workspaceSlug] ?? "",
    onQueryChange: (query: string) => context.setWorkspaceQuery(workspaceSlug, query),
  };
};
