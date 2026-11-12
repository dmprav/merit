import { z } from "zod";

import { moneyDataSchema } from "@merit/money";
import { recommendationDataSchema } from "@merit/recommendations/api";
import { publicRoundSchema, fundingRoundDataSchema } from "@merit/rounds/api";

import {
  encodeApplication as encodeRecord,
  decodeApplication as decodeRecord,
  encodeRoundOverview as encodeOverview,
  decodeRoundOverview as decodeOverview,
} from "../domain/encoding";
import {
  applicationRecordSchema,
  type FundingRoundOverview,
  type ApplicationRecord,
} from "../domain/model";

// Public payload fields are selected independently of stored records and internal additions.

const publicApplicationSchema = applicationRecordSchema.pick({
  id: true,
  title: true,
  version: true,
  requested: true,
  submission: true,
  evidence: true,
  intakeStatus: true,
  summaryAuthor: true,
  summary: true,
  reviews: true,
  contactId: true,
  managerRecommendation: true,
  attention: true,
});
const publicRoundOverviewSchema = publicRoundSchema.extend({
  applications: z.array(publicApplicationSchema),
});

const applicationDataSchema = publicApplicationSchema.extend({
  requested: moneyDataSchema.nullable(),
  managerRecommendation: recommendationDataSchema.nullable(),
});
const fundingRoundOverviewDataSchema = fundingRoundDataSchema.extend({
  applications: z.array(applicationDataSchema),
});

export type FundingRoundOverviewData = z.infer<typeof fundingRoundOverviewDataSchema>;

export const encodeApplication = (input: ApplicationRecord) =>
  encodeRecord(publicApplicationSchema.parse(input));

export const encodeRoundOverview = (input: FundingRoundOverview): FundingRoundOverviewData =>
  encodeOverview(publicRoundOverviewSchema.parse(input));

export const decodeApplication = (input: unknown): ApplicationRecord =>
  decodeRecord(applicationDataSchema.parse(input));

export const decodeRoundOverview = (input: unknown): FundingRoundOverview =>
  decodeOverview(fundingRoundOverviewDataSchema.parse(input));
