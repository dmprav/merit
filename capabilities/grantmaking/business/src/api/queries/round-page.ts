import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";
import {
  decodeRound,
  encodeRound,
  fundingRoundDataSchema,
  type FundingRound,
} from "@merit/rounds/domain";

import type { summarizeRound } from "../../domain/summaries";
import { roundTotalsDataSchema, encodeBudgetTotals } from "./application-detail";

const count = z.number().int().nonnegative();
const roundPageDataSchema = fundingRoundDataSchema.extend({
  applicationCount: count,
  criteriaImpact: z.object({ assessments: count, requests: count }),
  totals: roundTotalsDataSchema.extend({
    requested: moneyDataSchema,
    unknownRequests: count,
    reviews: z.object({
      assigned: count,
      submitted: count,
      current: count,
      outdated: count,
      outstanding: count,
      unknown: count,
    }),
  }),
});

/** Round properties and whole-round totals; applications are read through the bounded list. */
export type RoundPage = FundingRound & {
  applicationCount: number;
  criteriaImpact: { assessments: number; requests: number };
  totals: ReturnType<typeof summarizeRound>;
};

export const encodeRoundPage = (round: RoundPage) =>
  roundPageDataSchema.parse({
    ...encodeRound(round),
    applicationCount: round.applicationCount,
    criteriaImpact: round.criteriaImpact,
    totals: {
      ...encodeBudgetTotals(round.totals),
      committed: encodeMoney(round.totals.committed),
      available: round.totals.available === null ? null : encodeMoney(round.totals.available),
      requested: encodeMoney(round.totals.requested),
      unknownRequests: round.totals.unknownRequests,
      reviews: round.totals.reviews,
    },
  });

export const decodeRoundPage = (input: unknown): RoundPage => {
  const data = roundPageDataSchema.parse(input);
  return {
    ...decodeRound(data),
    applicationCount: data.applicationCount,
    criteriaImpact: data.criteriaImpact,
    totals: {
      ...data.totals,
      requested: decodeMoney(data.totals.requested),
      proposed: decodeMoney(data.totals.proposed),
      remaining: data.totals.remaining === null ? null : decodeMoney(data.totals.remaining),
      committed: decodeMoney(data.totals.committed),
      available: data.totals.available === null ? null : decodeMoney(data.totals.available),
    },
  };
};
