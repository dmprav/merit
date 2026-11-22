import { z } from "zod";

import { roundHistorySummarySchema } from "@merit/grantmaking/api";
import { decodeMoney, formatMoney, type MoneyData } from "@merit/money";

const displayedAmount = z.string().nullable();
export const roundHistoryToolEntrySchema = roundHistorySummarySchema.extend({
  budgetChange: roundHistorySummarySchema.shape.budgetChange
    .unwrap()
    .extend({
      beforeDisplay: displayedAmount,
      afterDisplay: displayedAmount,
    })
    .nullable(),
});

const display = (amount: MoneyData | null) =>
  amount === null ? null : formatMoney(decodeMoney(amount), "en-IE");

export const presentRoundHistoryEntry = (entry: z.output<typeof roundHistorySummarySchema>) => ({
  ...entry,
  budgetChange: entry.budgetChange && {
    ...entry.budgetChange,
    beforeDisplay: display(entry.budgetChange.before),
    afterDisplay: display(entry.budgetChange.after),
  },
});
