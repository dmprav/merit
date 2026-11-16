import type { z } from "zod";

import type { PreparationState } from "@merit/grantmaking/api";
import type { PageSource } from "@merit/query/contracts";
import type { editRoundRequestSchema, deleteRoundRequestSchema } from "@merit/rounds/api";
import type { PreparationSaveError } from "@merit/rounds/api";
import type { FundingRound, RoundChange } from "@merit/rounds/domain";

export type { PreparationState } from "@merit/grantmaking/api";

/** Round properties and the impact facts needed to edit or delete the round. */
export type PreparationRound = Pick<
  FundingRound,
  | "title"
  | "purpose"
  | "budget"
  | "meetingDate"
  | "criteria"
  | "manager"
  | "managerUserId"
  | "managerNeedsReassignment"
  | "decisionStatus"
> & {
  applicationCount: number;
  criteriaImpact: { assessments: number; requests: number };
};

export type PreparationFailure =
  | { status: "invalid"; error: PreparationSaveError }
  | { status: "conflict" | "not_found" | "signed_out" | "unavailable" };

export type PreparationData = {
  historySource?: PageSource<PreparationState["budgetHistory"][number]>;
  draftKey: string;
  state: PreparationState;
  save: (
    change: RoundChange,
    revision: number,
  ) => Promise<{ status: "ok"; revision: number } | PreparationFailure>;
  delete: (revision: number) => Promise<{ status: "ok" } | PreparationFailure>;
  refresh: () => Promise<void>;
  refreshCurrent: () => Promise<void>;
};

export type PreparationTransport = {
  editRound: (input: z.infer<typeof editRoundRequestSchema>) => ReturnType<PreparationData["save"]>;
  deleteRound: (
    input: z.infer<typeof deleteRoundRequestSchema>,
  ) => ReturnType<PreparationData["delete"]>;
};
