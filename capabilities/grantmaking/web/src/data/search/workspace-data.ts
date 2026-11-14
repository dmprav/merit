import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { WorkspaceSearchData, WorkspaceSearchTransport } from "../../contracts/search";

/**
 * Reads each settled query from the workspace's transport. A newer query cancels the older
 * request through the abort signal, earlier results stay while the next load, and nothing is
 * kept once no search displays it, since typed text and its results are private.
 */
export const createWorkspaceSearchData = (
  source: WorkspaceSearchTransport,
): WorkspaceSearchData => ({
  useResults: (query) => {
    const read = useQuery({
      queryKey: [...source.scope, "search", query],
      // Keep the query with its results, since earlier results stay while the next load.
      queryFn: async ({ signal }) => ({
        answered: query,
        results: await source.read(query, signal),
      }),
      enabled: query !== "",
      // Results stay on screen while the next ones load, but not across an emptied field.
      placeholderData: query === "" ? undefined : keepPreviousData,
      gcTime: 0,
    });
    return {
      results: read.data?.results,
      answered: read.data?.answered,
      failed: read.isError,
      fetching: read.isFetching,
      updatedAt: read.dataUpdatedAt,
      retry: () => void read.refetch(),
    };
  },
});
