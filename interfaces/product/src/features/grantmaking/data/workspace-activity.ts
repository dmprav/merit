import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { ActivityFilters } from "@merit/grantmaking-web/activity";

import { activityOptions } from "./queries";

export const noActivityFilters: ActivityFilters = { roundId: "", personId: "" };

// The server already presents these outcomes; the mapping keeps the page's status set closed.
const pageOutcome = <Status extends string>(
  status: Status,
): Exclude<Status, "forbidden" | "invalid"> | "not_found" | "unavailable" =>
  status === "forbidden"
    ? "not_found"
    : status === "invalid"
      ? "unavailable"
      : (status as Exclude<Status, "forbidden" | "invalid">);

const loadState = (query: {
  isError: boolean;
  isFetchingNextPage: boolean;
  isPlaceholderData: boolean;
}) =>
  query.isError
    ? "failed"
    : query.isFetchingNextPage
      ? "loadingMore"
      : query.isPlaceholderData
        ? "refreshing"
        : "ready";

/** Filters are page state, so the selected person never enters the address or history.
 * Changing a filter selects another cache entry and starts again from the newest entry. */
export const useWorkspaceActivity = (workspaceSlug: string) => {
  const client = useQueryClient();
  const [filters, setFilters] = useState(noActivityFilters);
  const query = useInfiniteQuery({
    ...activityOptions(workspaceSlug, filters),
    placeholderData: keepPreviousData,
  });
  const pages = query.data?.pages ?? [];
  const denied = pages.find((page) => page.status !== "ok");
  if (denied) {
    return { status: pageOutcome(denied.status) } as const;
  }
  if (!query.data && !query.isError) {
    return { status: "loading" } as const;
  }

  // A failed filter change keeps the controls and the last known choices on the page.
  const known = client.getQueryData(activityOptions(workspaceSlug, noActivityFilters).queryKey);
  const ok = pages.flatMap((page) => (page.status === "ok" ? [page] : []));
  const first = ok[0] ?? known?.pages.find((page) => page.status === "ok");
  return {
    status: "ok",
    entries: ok.flatMap((page) => page.entries),
    people: first?.status === "ok" ? first.people : [],
    filters,
    onFiltersChange: setFilters,
    hasMore: query.hasNextPage,
    onShowMore: () => void query.fetchNextPage(),
    onRetry: () => void query.refetch(),
    loading: loadState(query),
  } as const;
};
