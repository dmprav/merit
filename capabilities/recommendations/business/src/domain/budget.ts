import { sum, subtract, type Money } from "@merit/money";

export const allocationTotals = (budget: Money | null, allocations: readonly Money[]) => {
  const proposed = sum(allocations);
  return { proposed, remaining: budget === null ? null : subtract(budget, proposed) };
};

export type BudgetTotals = ReturnType<typeof allocationTotals> & { withdrawnApplications: number };

/** The proposed total must stay within the money contract for totals to be recorded and read. */
export const allocationTotalProblem = (allocations: readonly Money[]) => {
  try {
    sum(allocations);
    return null;
  } catch (error) {
    if (error instanceof RangeError) {
      return "allocation_total_too_large" as const;
    }
    throw error;
  }
};
