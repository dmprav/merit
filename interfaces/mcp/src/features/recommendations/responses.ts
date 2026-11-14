import { z } from "zod";

import { publicIdSchema, totalsDataSchema, encodeBudgetTotals } from "@merit/grantmaking/api";
import { encodeMoney, moneyDataSchema } from "@merit/money";
import {
  recommendationDataSchema,
  encodeRecommendation,
  type RecommendationsService,
} from "@merit/recommendations/api";

export const savedRecommendationSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  recommendation: recommendationDataSchema,
  recommendationRevision: z.number().int().nonnegative(),
  budget: moneyDataSchema.nullable(),
  totals: totalsDataSchema,
});

export const presentRecommendation = (
  result: Awaited<ReturnType<RecommendationsService["saveRecommendation"]>>,
  applicationId: string,
) =>
  result.status === "ok"
    ? {
        status: "ok" as const,
        applicationId,
        recommendation: encodeRecommendation(result.recommendation),
        recommendationRevision: result.recommendationVersion,
        budget: result.budget === null ? null : encodeMoney(result.budget),
        totals: encodeBudgetTotals(result.totals),
      }
    : result;
