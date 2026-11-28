import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";

import type { BudgetTotals } from "../domain/budget";

export const totalsDataSchema = z.object({
  proposed: moneyDataSchema,
  remaining: moneyDataSchema.nullable(),
  withdrawnApplications: z.number().int().nonnegative(),
});

export const encodeBudgetTotals = (totals: BudgetTotals) => ({
  proposed: encodeMoney(totals.proposed),
  remaining: totals.remaining === null ? null : encodeMoney(totals.remaining),
  withdrawnApplications: totals.withdrawnApplications,
});

export const decodeBudgetTotals = (totals: z.infer<typeof totalsDataSchema>): BudgetTotals => ({
  proposed: decodeMoney(totals.proposed),
  remaining: totals.remaining === null ? null : decodeMoney(totals.remaining),
  withdrawnApplications: totals.withdrawnApplications,
});
