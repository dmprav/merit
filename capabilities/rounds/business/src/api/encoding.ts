import { type z } from "zod";

import { moneyDataSchema } from "@merit/money";

import { encodeRound as encodeRecord, decodeRound as decodeRecord } from "../domain/encoding";
import { fundingRoundSchema, type FundingRound } from "../domain/model";

export const publicRoundSchema = fundingRoundSchema.pick({
  id: true,
  title: true,
  foundation: true,
  purpose: true,
  manager: true,
  managerUserId: true,
  managerNeedsReassignment: true,
  currency: true,
  budget: true,
  meetingDate: true,
  snapshotDate: true,
  decisionStatus: true,
  criteria: true,
  criteriaVersion: true,
  criteriaHistory: true,
});
export const fundingRoundDataSchema = publicRoundSchema.extend({
  budget: moneyDataSchema.nullable(),
});

export type FundingRoundData = z.infer<typeof fundingRoundDataSchema>;

export const encodeRound = (input: FundingRound): FundingRoundData =>
  encodeRecord(publicRoundSchema.parse(input));

export const decodeRound = (input: unknown): FundingRound =>
  decodeRecord(fundingRoundDataSchema.parse(input));
