import type { QueryClient } from "@tanstack/react-query";

import type { PreparationState } from "@merit/rounds-web/contracts";
import { createPreparationData } from "@merit/rounds-web/data";

import { grantWorkQueryKey } from "../../../../shared/grant-work-query-key";
import { roundOptions } from "../queries";
import { editRound, deleteRound } from "../server/preparation/preparation.functions";

export const workspacePreparationData = (
  client: QueryClient,
  workspaceSlug: string,
  publicId: string,
  state: PreparationState,
) =>
  createPreparationData(
    client,
    { workspaceSlug, publicId, state },
    {
      round: roundOptions(workspaceSlug, publicId),
      grantWorkScope: grantWorkQueryKey(workspaceSlug),
      editRound: (data) => editRound({ data }),
      deleteRound: (data) => deleteRound({ data }),
    },
  );
