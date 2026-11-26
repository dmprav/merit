import type { QueryClient } from "@tanstack/react-query";

import { createDecisionData } from "@merit/decisions-web/data";
import type { DecisionStateData } from "@merit/decisions/api";

import { applicationOptions, fundingRoundsQueryKey } from "../queries";
import type { recordDecision } from "../server/decisions/decisions.functions";

export const workspaceDecisionData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  state: DecisionStateData,
  save: (input: Parameters<typeof recordDecision>[0]) => ReturnType<typeof recordDecision>,
) =>
  createDecisionData(
    client,
    { workspaceSlug, publicId, state },
    {
      application: applicationOptions(workspaceSlug, publicId),
      roundScope: fundingRoundsQueryKey(workspaceSlug),
      save: (input) => save({ data: input }),
      applySaved: (cached, saved) => {
        if (cached.status !== "ok") {
          return cached;
        }
        const versions = saved.recorded
          ? [saved.decision, ...cached.decision.versions]
          : cached.decision.versions;
        return {
          ...cached,
          round: {
            ...cached.round,
            budget: saved.budget,
            totals: { ...cached.round.totals, ...saved.totals },
          },
          decision: { revision: saved.decision.revision, versions },
        };
      },
    },
  );
