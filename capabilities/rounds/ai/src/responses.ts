import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { moneyDataSchema } from "@merit/money";

export const roundCreatedSchema = z.object({ status: z.literal("ok"), roundId: publicIdSchema });
export const roundSavedSchema = z.object({
  status: z.literal("ok"),
  roundId: publicIdSchema,
  preparationRevision: z.number().int().nonnegative(),
});

/** A budget change the round's committed funding does not allow, with the total it must cover. */
export const budgetBelowCommitmentsSchema = z.object({
  status: z.literal("invalid"),
  error: z.literal("budget_below_commitments"),
  committed: moneyDataSchema,
});
