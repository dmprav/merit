import { type z } from "zod";

import { encodeMoney, decodeMoney, moneyDataSchema } from "@merit/money";

import { fundingRoundSchema, type FundingRound } from "./model";

export const fundingRoundDataSchema = fundingRoundSchema.extend({
  budget: moneyDataSchema.nullable(),
});

export type FundingRoundData = z.infer<typeof fundingRoundDataSchema>;

export const encodeRound = (input: FundingRound): FundingRoundData => {
  const round = fundingRoundSchema.parse(input);
  return {
    ...round,
    budget: round.budget === null ? null : encodeMoney(round.budget),
  };
};

export const decodeRound = (input: unknown): FundingRound => {
  const round = fundingRoundDataSchema.parse(input);
  return fundingRoundSchema.parse({
    ...round,
    budget: round.budget === null ? null : decodeMoney(round.budget),
  });
};
