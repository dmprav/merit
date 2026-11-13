import type { QueryClient } from "@tanstack/react-query";

import { available } from "@merit/query";
import type { PreparationState } from "@merit/rounds-web/contracts";
import { createPreparationData } from "@merit/rounds-web/data";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import { roundOptions } from "../queries";
import { readBudgetHistory } from "../server/history.functions";
import { editRound, deleteRound } from "../server/preparation/preparation.functions";

export const workspacePreparationData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  state: PreparationState,
) => ({
  historySource: {
    queryKey: [...grantWorkQueryKey(workspaceSlug), publicId, "budgetHistory", state.revision],
    read: async (after: string | undefined, signal: AbortSignal) => {
      const result = available(
        await readBudgetHistory({ data: { workspaceSlug, roundId: publicId, after }, signal }),
      );
      return result.status === "ok" ? result : null;
    },
  },
  ...createPreparationData(
    client,
    { workspaceSlug, publicId, state },
    {
      round: roundOptions(workspaceSlug, publicId),
      grantWorkScope: grantWorkQueryKey(workspaceSlug),
      editRound: (data) => editRound({ data }),
      deleteRound: (data) => deleteRound({ data }),
    },
  ),
});
