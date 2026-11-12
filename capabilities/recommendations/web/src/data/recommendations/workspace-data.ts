import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

import { type encodeApplicationDetail } from "@merit/grantmaking/api";
import { encodeRecommendation } from "@merit/recommendations/api";

import type { RecommendationData, RecommendationTransport } from "../../contracts/recommendations";

type ApplicationCache =
  | ({ status: "ok"; recommendationVersion: number } & ReturnType<typeof encodeApplicationDetail>)
  | { status: "not_found" | "signed_out" | "unavailable" };

type RecommendationSource<TApplication extends ApplicationCache, TKey extends QueryKey> = {
  application: FetchQueryOptions<TApplication, Error, TApplication, TKey>;
  roundScope: QueryKey;
  save: RecommendationTransport;
};

export const createRecommendationData = <
  TApplication extends ApplicationCache,
  TKey extends QueryKey,
>(
  client: QueryClient,
  target: { workspaceSlug: string; publicId: string; revision: number },
  source: RecommendationSource<TApplication, TKey>,
): RecommendationData => {
  const { workspaceSlug, publicId, revision } = target;
  const { application, roundScope, save } = source;

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
          cached?.status === "ok"
            ? {
                ...cached,
                application: {
                  ...cached.application,
                  managerRecommendation: response.recommendation,
                },
                round: { ...cached.round, budget: response.budget, totals: response.totals },
                recommendationVersion: response.recommendationVersion,
              }
            : cached,
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
