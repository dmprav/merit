import { z } from "zod";

import { encodeMoney, moneyDataSchema } from "@merit/money";

import { encodeRecommendation, recommendationDataSchema } from "../domain/encoding";
import { encodeBudgetTotals, totalsDataSchema } from "./budget-totals";
import type { RecommendationsService } from "./service";

export const savedRecommendationDataSchema = z.object({
  status: z.literal("ok"),
  recommendation: recommendationDataSchema,
  recommendationVersion: z.number().int().nonnegative(),
  budget: moneyDataSchema.nullable(),
  totals: totalsDataSchema,
});

export const encodeRecommendationResult = (
  result: Awaited<ReturnType<RecommendationsService["saveRecommendation"]>>,
) => {
  if (result.status !== "ok") {
    return result;
  }
  return {
    status: result.status,
    recommendation: encodeRecommendation(result.recommendation),
    recommendationVersion: result.recommendationVersion,
    budget: result.budget === null ? null : encodeMoney(result.budget),
    totals: encodeBudgetTotals(result.totals),
  } satisfies z.infer<typeof savedRecommendationDataSchema>;
};
