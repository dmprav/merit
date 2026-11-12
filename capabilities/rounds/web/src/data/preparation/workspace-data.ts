import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  PreparationData,
  PreparationState,
  PreparationTransport,
} from "../../contracts/preparation";

type PreparationSource<TData, TKey extends QueryKey> = PreparationTransport & {
  round: FetchQueryOptions<TData, Error, TData, TKey>;
  grantWorkScope: QueryKey;
};

export const createPreparationData = <TData, TKey extends QueryKey>(
  client: QueryClient,
  target: { workspaceSlug: string; publicId: string; state: PreparationState },
  source: PreparationSource<TData, TKey>,
): PreparationData => {
  const { workspaceSlug, publicId, state } = target;
  return {
    draftKey: `${workspaceSlug}/${publicId}`,
    state,
    save: (change, revision) =>
      source.editRound({ workspaceSlug, publicId, change, expectedRevision: revision }),
    delete: async (revision) => {
      const result = await source.deleteRound({
        workspaceSlug,
        publicId,
        expectedRevision: revision,
      });
      if (result.status === "ok") {
        client.removeQueries({ queryKey: source.round.queryKey, exact: true });
        void client.invalidateQueries({ queryKey: source.grantWorkScope });
      }
      return result;
    },
    refresh: () =>
      client.invalidateQueries({ queryKey: source.grantWorkScope }, { throwOnError: true }),
    refreshCurrent: async () => {
      await client.fetchQuery({ ...source.round, staleTime: 0 });
    },
  };
};
