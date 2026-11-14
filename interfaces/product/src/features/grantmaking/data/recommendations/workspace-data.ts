import type { QueryClient } from "@tanstack/react-query";

import { createRecommendationData } from "@merit/recommendations-web/data";

import { applicationOptions, fundingRoundsQueryKey } from "../queries";
import type { saveRecommendation } from "../server/recommendations/recommendations.functions";

export const workspaceRecommendationData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  revision: number,
  save: (input: Parameters<typeof saveRecommendation>[0]) => ReturnType<typeof saveRecommendation>,
) =>
  createRecommendationData(
    client,
    { workspaceSlug, publicId, revision },
    {
      application: applicationOptions(workspaceSlug, publicId),
      roundScope: fundingRoundsQueryKey(workspaceSlug),
      save: (input) => save({ data: input }),
      applySaved: (cached, saved) =>
        cached.status === "ok"
          ? {
              ...cached,
              application: {
                ...cached.application,
                managerRecommendation: saved.recommendation,
              },
              round: { ...cached.round, budget: saved.budget, totals: saved.totals },
              recommendationVersion: saved.recommendationVersion,
            }
          : cached,
    },
  );
