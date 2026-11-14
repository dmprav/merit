import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

import { encodeRecommendation } from "@merit/recommendations/api";

import type {
  RecommendationData,
  RecommendationSaveResponse,
  RecommendationTransport,
} from "../../contracts/recommendations";

export type RecommendationSaved = Extract<RecommendationSaveResponse, { status: "ok" }>;

type RecommendationSource<TApplication, TKey extends QueryKey> = {
  application: FetchQueryOptions<TApplication, Error, TApplication, TKey>;
  roundScope: QueryKey;
  save: RecommendationTransport;
  applySaved: (cached: TApplication, saved: RecommendationSaved) => TApplication;
};

export const createRecommendationData = <TApplication, TKey extends QueryKey>(
  client: QueryClient,
  target: { workspaceSlug: string; publicId: string; revision: number },
  source: RecommendationSource<TApplication, TKey>,
): RecommendationData => {
  const { workspaceSlug, publicId, revision } = target;
  const { application, roundScope, save, applySaved } = source;

  return {
    disabled: false,
    revision,
    save: async (recommendation, baseline) => {
      const response = await save({
        workspaceSlug,
        publicId,
        ...baseline,
        recommendation: encodeRecommendation(recommendation),
      });
      if (response.status === "ok") {
        await client.cancelQueries({ queryKey: application.queryKey });
        client.setQueryData<TApplication>(application.queryKey, (cached) =>
          cached === undefined ? cached : applySaved(cached, response),
        );
        await client.invalidateQueries({ queryKey: roundScope, refetchType: "none" });
      } else if (response.status === "conflict") {
        // A rejected write remains a conflict even when refreshing the current record fails.
        await client.fetchQuery(application).catch(() => undefined);
      }

      return response;
    },
  };
};
