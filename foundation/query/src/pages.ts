import { useInfiniteQuery } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

import type { PageSource } from "./contracts";

export const usePagedContent = <T>(source: PageSource<T>) => {
  const query = useInfiniteQuery({
    queryKey: source.queryKey,
    queryFn: ({ pageParam, signal }) => source.read(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page?.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
  const denied = query.data?.pages.some((page) => page === null) ?? false;
  return {
    entries: denied ? [] : (query.data?.pages.flatMap((page) => page?.entries ?? []) ?? []),
    loaded: !!query.data,
    denied,
    pending: query.isPending,
    fetching: query.isFetching,
    failed: query.isError,
    hasMore: !denied && query.hasNextPage,
    more: () => query.fetchNextPage(),
    retry: () => (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()),
  };
};

export type PagedContentState<T> = {
  entries: T[];
  loaded: boolean;
  denied: boolean;
  pending: boolean;
  fetching: boolean;
  failed: boolean;
  hasMore: boolean;
  more: () => unknown;
  retry: () => unknown;
};

type RemotePagedContentProps<T> = {
  source?: PageSource<T>;
  entries: T[];
  active: boolean;
  children: (page: PagedContentState<T>) => ReactNode;
};

const ActiveRemotePagedContent = <T>({
  source,
  children,
}: {
  source: PageSource<T>;
  children: (page: PagedContentState<T>) => ReactNode;
}) => children(usePagedContent(source));

/** Mounts the paged query only when active, or passes static entries directly when no source is given. */
export const RemotePagedContent = <T>({
  source,
  entries,
  active,
  children,
}: RemotePagedContentProps<T>): ReactNode => {
  if (!source) {
    return children({
      entries,
      loaded: true,
      denied: false,
      pending: false,
      fetching: false,
      failed: false,
      hasMore: false,
      more: () => undefined,
      retry: () => undefined,
    });
  }
  if (!active) {
    return null;
  }
  return createElement(ActiveRemotePagedContent<T>, { source, children });
};
