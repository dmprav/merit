import type { QueryClient } from "@tanstack/react-query";

import { createDecisionData } from "@merit/decisions-web/data";
import type { DecisionStateData } from "@merit/decisions/api";
import { decisionUsage } from "@merit/decisions/domain";

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
        // A refresh or another tab may already hold this revision or a newer one.
        const head = cached.decision.versions[0];
        if (head && saved.decision.revision < head.revision) {
          return cached;
        }
        // An equal revision keeps the cached versions but still takes the round facts the save read.
        const isNewer = !head || saved.decision.revision > head.revision;
        const versions =
          saved.recorded && isNewer
            ? [saved.decision, ...cached.decision.versions]
            : cached.decision.versions;
        return {
          ...cached,
          // Deleting and withdrawing depend on what the decision commits.
          intake: {
            ...cached.intake,
            decisions: decisionUsage(versions[0]?.decision.outcome),
          },
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
