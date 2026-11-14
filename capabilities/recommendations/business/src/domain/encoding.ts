import { z } from "zod";

import { encodeMoney, decodeMoney, moneyDataSchema } from "@merit/money";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { allocationTotals } from "./budget";
import { recommendationSchema, type Recommendation } from "./recommendation";

export const recommendationDataSchema = z.strictObject({
  ...recommendationSchema.shape,
  allocation: moneyDataSchema,
});

export const encodeRecommendation = (value: Recommendation) => ({
  ...value,
  allocation: encodeMoney(value.allocation),
});

export const decodeRecommendation = (input: unknown): Recommendation => {
  const value = recommendationDataSchema.parse(input);
  return recommendationSchema.parse({ ...value, allocation: decodeMoney(value.allocation) });
};

export const decodeBudgetContext = (
  budget: unknown,
  allocations: unknown,
  withdrawnApplications: number,
) => {
  const value =
    budget === null ? null : fundingRoundSchema.shape.budget.unwrap().parse(decodeMoney(budget));
  const amounts = z
    .array(moneyDataSchema.nullable())
    .parse(allocations)
    .flatMap((amount) =>
      amount ? [fundingRoundSchema.shape.budget.unwrap().parse(decodeMoney(amount))] : [],
    );

  return {
    budget: value,
    totals: { ...allocationTotals(value, amounts), withdrawnApplications },
  };
};
