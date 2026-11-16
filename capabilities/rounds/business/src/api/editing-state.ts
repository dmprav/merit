import type { RecordedChange } from "@merit/audit/api";
import type { MoneyData } from "@merit/money";

/** Current round preparation facts shared by interfaces, independently of page transport. */
export type PreparationState = {
  revision: number;
  managers: { userId: string; name: string | null; email: string | null }[];
  budgetHistory: RecordedChange<MoneyData>[];
};
