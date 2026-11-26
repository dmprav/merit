import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

import type { DecisionStateData } from "@merit/decisions/api";
import { decodeDecision, type DecisionVersion } from "@merit/decisions/domain";
import { encodeMoney } from "@merit/money";

import type {
  DecisionData,
  DecisionSaveResponse,
  DecisionTransport,
} from "../../contracts/decisions";

export type DecisionSaved = Extract<DecisionSaveResponse, { status: "ok" }>;

type DecisionSource<TApplication, TKey extends QueryKey> = {
  application: FetchQueryOptions<TApplication, Error, TApplication, TKey>;
  roundScope: QueryKey;
  save: DecisionTransport;
  applySaved: (cached: TApplication, saved: DecisionSaved) => TApplication;
};

/** Decodes the transported decision case into versions, newest first. */
const decodeDecisionVersions = (state: DecisionStateData): readonly DecisionVersion[] =>
  state.versions.map((version) => ({
    revision: version.revision,
    decision: decodeDecision(version.decision),
  }));

export const createDecisionData = <TApplication, TKey extends QueryKey>(
  client: QueryClient,
  target: { workspaceSlug: string; publicId: string; state: DecisionStateData },
  source: DecisionSource<TApplication, TKey>,
): DecisionData => {
  const { workspaceSlug, publicId, state } = target;
  const { application, roundScope, save, applySaved } = source;

  return {
    disabled: false,
    revision: state.revision,
    versions: decodeDecisionVersions(state),
    save: async (decision, baseline) => {
      const response = await save({
        workspaceSlug,
        publicId,
        expectedRevision: baseline.expectedRevision,
        decision: {
          outcome: decision.outcome,
          amount: encodeMoney(decision.amount),
          conditions: decision.conditions,
          reason: decision.reason,
          decidedBy: decision.decidedBy,
          decisionDate: decision.decisionDate,
          ...(decision.changeExplanation === undefined
            ? {}
            : { changeExplanation: decision.changeExplanation }),
        },
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
