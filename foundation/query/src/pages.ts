import { useInfiniteQuery } from "@tanstack/react-query";

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
