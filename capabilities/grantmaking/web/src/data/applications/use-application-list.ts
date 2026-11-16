import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useEffectEvent } from "react";

import {
  workspaceApplicationsPageSize,
  workspaceApplicationsInput,
  type WorkspaceApplicationsQuery,
  type WorkspaceApplicationsPage,
} from "@merit/grantmaking/api";

import type {
  ApplicationListSource,
  ApplicationListResult,
  ApplicationListOptions,
} from "../../contracts/application-list";
import { useApplicationListView } from "./application-list-views";
import { applicationListOptions } from "./queries";

type PreviousPage = { scope: string; page: WorkspaceApplicationsPage } | undefined;

const emptyPage: WorkspaceApplicationsPage = { applications: [], total: 0, matching: 0, offset: 0 };

const displayedPage = (
  result: ApplicationListResult | undefined,
  previous: PreviousPage,
  scope: string,
) => {
  if (result?.status === "ok") {
    return result;
  }
  if (result) {
    return emptyPage;
  }
  return previous?.scope === scope ? previous.page : emptyPage;
};

/** A failed page keeps the last successful page in this scope; denial clears it. */
const useApplicationPage = (
  source: ApplicationListSource,
  input: WorkspaceApplicationsQuery,
  view: ReturnType<typeof useApplicationListView>,
  enabled: boolean,
) => {
  const scope = JSON.stringify([view.scope, input]);
  const [request, setRequest] = useState({ scope, page: view.page });
  if (request.scope !== scope) {
    setRequest({ scope, page: view.page?.scope === scope ? view.page : undefined });
  }
  const requested = request.scope === scope ? request.page : view.page;
  const offset = requested?.scope === scope ? requested.offset : 0;
  const query = useQuery({
    ...applicationListOptions(source, { ...input, offset }),
    // Preserve loader HTML until hydration; revalidate restored pages after mutations.
    enabled,
    retry: false,
    staleTime: 1000,
    refetchOnMount: true,
  });
  const [retrying, setRetrying] = useState(false);
  const [previous, setPrevious] = useState<PreviousPage>();
  const result = query.data;
  const rememberPage = useEffectEvent((offset: number) => view.onPageChange({ scope, offset }));
  useEffect(() => {
    if (result?.status === "ok") {
      setPrevious({ scope, page: result });
      rememberPage(result.offset);
    }
  }, [result, scope]);
  const page = displayedPage(result, previous, scope);
  return {
    status: result?.status ?? "ok",
    page,
    fetching: query.isFetching,
    failed: query.isError,
    retrying,
    onPrevious: () =>
      setRequest({
        scope,
        page: { scope, offset: Math.max(0, page.offset - workspaceApplicationsPageSize) },
      }),
    onNext: () =>
      setRequest({ scope, page: { scope, offset: page.offset + workspaceApplicationsPageSize } }),
    onRetry: () => {
      setRetrying(true);
      void query.refetch().finally(() => setRetrying(false));
    },
  };
};

/** One bounded list, with text and criteria kept in account-session state and request bodies. */
export const useApplicationList = (
  source: ApplicationListSource,
  workspaceSlug: string,
  { viewId, roundId, sorting: controlledSorting, enabled = true }: ApplicationListOptions,
) => {
  const view = useApplicationListView(`${workspaceSlug}/${viewId}`);
  const sorting = controlledSorting ?? { value: view.sorting, onChange: view.onSortingChange };
  const [settled, setSettled] = useState(view.query.trim());
  useEffect(() => {
    const timer = setTimeout(() => setSettled(view.query.trim()), 150);
    return () => clearTimeout(timer);
  }, [view.query]);
  const input = workspaceApplicationsInput.parse({
    workspaceSlug,
    roundId,
    sort: sorting.value?.columnId,
    direction: sorting.value?.direction,
    filter: view.filter,
    query: settled,
  });
  const read = useApplicationPage(source, input, view, enabled);
  const typing = view.query.trim() !== settled;
  const page = typing ? emptyPage : read.page;
  return {
    status: read.status,
    sorting: sorting.value,
    onSortingChange: sorting.onChange,
    filter: view.filter,
    onFilterChange: view.onFilterChange,
    query: view.query,
    onQueryChange: view.onQueryChange,
    applications: page.applications,
    pagination: {
      total: page.total,
      matching: page.matching,
      offset: page.offset,
      loading: typing || read.fetching,
      retrying: read.retrying,
      failed: read.failed && !read.fetching && !typing,
      onPrevious: read.onPrevious,
      onNext: read.onNext,
      onRetry: read.onRetry,
    },
  };
};
