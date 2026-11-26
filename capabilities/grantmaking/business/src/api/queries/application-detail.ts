import { z } from "zod";

import { commitmentTotals, decodeCommitments } from "@merit/decisions/domain";
import { decodeMoney, encodeMoney, moneyDataSchema, type Money } from "@merit/money";
import { decodeBudgetContext } from "@merit/recommendations/domain";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { decodeApplication, encodeApplication } from "../../domain/encoding";
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
  withdrawnApplications: z.number().int().nonnegative(),
});

/** Proposed totals come from recommendations; committed totals come from decisions. */
export const roundTotalsDataSchema = totalsDataSchema.extend({
  committed: moneyDataSchema,
  available: moneyDataSchema.nullable(),
});

export const decodeApplicationContext = (
  input: unknown,
  allocations: unknown,
  commitments: unknown,
  withdrawnApplications: number,
): ApplicationRoundContext => {
  const context = contextDataSchema.parse(input);
  const budgeted = decodeBudgetContext(context.budget, allocations, withdrawnApplications);
  return {
    ...context,
    budget: budgeted.budget,
    totals: {
      ...budgeted.totals,
      ...commitmentTotals(budgeted.budget, decodeCommitments(commitments)),
    },
  };
};

export const encodeBudgetTotals = (totals: {
  proposed: Money;
  remaining: Money | null;
  withdrawnApplications: number;
}) => ({
  proposed: encodeMoney(totals.proposed),
  remaining: totals.remaining === null ? null : encodeMoney(totals.remaining),
  withdrawnApplications: totals.withdrawnApplications,
});

export const encodeRoundTotals = (totals: ApplicationRoundContext["totals"]) => ({
  ...encodeBudgetTotals(totals),
  committed: encodeMoney(totals.committed),
  available: totals.available === null ? null : encodeMoney(totals.available),
});

export const encodeApplicationDetail = (detail: {
  round: ApplicationRoundContext;
  application: ReturnType<typeof applicationView>;
}) => ({
  round: {
    ...contextSchema.parse(detail.round),
    budget: detail.round.budget === null ? null : encodeMoney(detail.round.budget),
    totals: encodeRoundTotals(detail.round.totals),
  },
  application: encodeApplication(detail.application),
});

const applicationDetailDataSchema = z.object({
  round: contextDataSchema.extend({ totals: roundTotalsDataSchema }),
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
        committed: decodeMoney(totals.committed),
        available: totals.available === null ? null : decodeMoney(totals.available),
        withdrawnApplications: totals.withdrawnApplications,
      },
    },
    application: applicationView(
      decodeApplication(data.application),
      round.criteria,
      round.criteriaVersion,
    ),
  };
};
