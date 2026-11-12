import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";
import { decodeBudgetContext } from "@merit/recommendations/domain";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { decodeApplication, encodeApplication } from "../encoding";
import { applicationView, type ApplicationRoundContext } from "./round-view";

const contextSchema = fundingRoundSchema.pick({
  id: true,
  title: true,
  foundation: true,
  manager: true,
  budget: true,
  criteria: true,
  criteriaVersion: true,
  criteriaHistory: true,
});
const contextDataSchema = contextSchema.extend({ budget: moneyDataSchema.nullable() });
export const totalsDataSchema = z.object({
  proposed: moneyDataSchema,
  remaining: moneyDataSchema.nullable(),
});

export const decodeApplicationContext = (
  input: unknown,
  allocations: unknown,
): ApplicationRoundContext => {
  const context = contextDataSchema.parse(input);
  return { ...context, ...decodeBudgetContext(context.budget, allocations) };
};

export const encodeBudgetTotals = (totals: ApplicationRoundContext["totals"]) => ({
  proposed: encodeMoney(totals.proposed),
  remaining: totals.remaining === null ? null : encodeMoney(totals.remaining),
});

export const encodeApplicationDetail = (detail: {
  round: ApplicationRoundContext;
  application: ReturnType<typeof applicationView>;
}) => ({
  round: {
    ...contextSchema.parse(detail.round),
    budget: detail.round.budget === null ? null : encodeMoney(detail.round.budget),
    totals: encodeBudgetTotals(detail.round.totals),
  },
  application: encodeApplication(detail.application),
});

const applicationDetailDataSchema = z.object({
  round: contextDataSchema.extend({ totals: totalsDataSchema }),
  application: z.unknown(),
});

export const decodeApplicationDetail = (input: unknown) => {
  const data = applicationDetailDataSchema.parse(input);
  const { totals, ...round } = data.round;

  return {
    round: {
      ...round,
      budget: round.budget === null ? null : decodeMoney(round.budget),
      totals: {
        proposed: decodeMoney(totals.proposed),
        remaining: totals.remaining === null ? null : decodeMoney(totals.remaining),
      },
    },
    application: applicationView(
      decodeApplication(data.application),
      round.criteria,
      round.criteriaVersion,
    ),
  };
};
