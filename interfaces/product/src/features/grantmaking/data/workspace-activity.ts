import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { ActivityFilters } from "@merit/grantmaking-web/activity";

import { activityOptions } from "./queries";

export const noActivityFilters: ActivityFilters = { roundId: "", personId: "" };

/** Filters are page state, so the selected person never enters the address or history.
 * Changing a filter selects another cache entry and starts again from the newest entry. */
export const useWorkspaceActivity = (workspaceSlug: string) => {
  const [filters, setFilters] = useState(noActivityFilters);
  const query = useInfiniteQuery({
    ...activityOptions(workspaceSlug, filters),
    placeholderData: keepPreviousData,
  });
  const pages = query.data?.pages ?? [];
  const denied = pages.find((page) => page.status !== "ok");
  if (denied) {
    return { status: denied.status } as const;
  }
  if (!query.data) {
    return { status: query.isError ? "unavailable" : "loading" } as const;
  }

  const ok = pages.flatMap((page) => (page.status === "ok" ? [page] : []));
  return {
    status: "ok",
    entries: ok.flatMap((page) => page.entries),
    people: ok[0]?.people ?? [],
    filters,
    onFiltersChange: setFilters,
    hasMore: query.hasNextPage,
    onShowMore: () => void query.fetchNextPage(),
    onRetry: () => void query.refetch(),
    loading: query.isError
      ? "failed"
      : query.isFetchingNextPage
        ? "loadingMore"
        : query.isPlaceholderData
          ? "refreshing"
          : "ready",
  } as const;
};
