import { sum, subtract, type Money } from "@merit/money";

export const allocationTotals = (budget: Money | null, allocations: readonly Money[]) => {
  const proposed = sum(allocations);
  return { proposed, remaining: budget === null ? null : subtract(budget, proposed) };
};
