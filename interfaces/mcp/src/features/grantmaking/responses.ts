import { z } from "zod";

import { publicIdSchema, totalsDataSchema, encodeBudgetTotals } from "@merit/grantmaking/api";
import { encodeMoney, moneyDataSchema } from "@merit/money";
import { recommendationDataSchema, encodeRecommendation } from "@merit/recommendations/api";

import type { FundingRoundOperations } from "./operations";

export const grantWriteErrorSchema = z.union([
  z.object({ status: z.enum(["not_found", "conflict"]) }),
  z.object({ status: z.literal("invalid"), error: z.string().min(1) }),
]);
export const roundCreatedSchema = z.object({ status: z.literal("ok"), roundId: publicIdSchema });
export const applicationCreatedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
});
export const roundSavedSchema = z.object({
  status: z.literal("ok"),
  roundId: publicIdSchema,
  preparationRevision: z.number().int().nonnegative(),
});
export const applicationSavedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  intakeRevision: z.number().int().nonnegative(),
});
export const reviewSavedSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  reviewRevision: z.number().int().nonnegative(),
});
export const savedRecommendationSchema = z.object({
  status: z.literal("ok"),
  applicationId: publicIdSchema,
  recommendation: recommendationDataSchema,
  recommendationRevision: z.number().int().nonnegative(),
  budget: moneyDataSchema.nullable(),
  totals: totalsDataSchema,
});

export const presentRecommendation = (
  result: Awaited<ReturnType<FundingRoundOperations["saveRecommendation"]>>,
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
