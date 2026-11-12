import type { z } from "zod";

import type { PreparationState } from "@merit/grantmaking/api";
import type { editRoundRequestSchema, deleteRoundRequestSchema } from "@merit/rounds/api";
import type { PreparationSaveError } from "@merit/rounds/api";
import type { RoundChange } from "@merit/rounds/domain";

export type { PreparationState } from "@merit/grantmaking/api";

export type PreparationFailure =
  | { status: "invalid"; error: PreparationSaveError }
  | { status: "conflict" | "not_found" | "signed_out" | "unavailable" };

export type PreparationData = {
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
