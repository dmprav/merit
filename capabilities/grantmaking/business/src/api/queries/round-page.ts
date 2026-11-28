import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";
import { decodeBudgetTotals } from "@merit/recommendations/api";
import {
  decodeRound,
  encodeRound,
  fundingRoundDataSchema,
  type FundingRound,
} from "@merit/rounds/domain";

import type { summarizeRound } from "../../domain/summaries";
import { roundTotalsDataSchema, encodeRoundTotals } from "./application-detail";

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
      ...encodeRoundTotals(round.totals),
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
      ...decodeBudgetTotals(data.totals),
      committed: decodeMoney(data.totals.committed),
      available: data.totals.available === null ? null : decodeMoney(data.totals.available),
    },
  };
};
