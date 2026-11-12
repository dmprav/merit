import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";
import {
  recommendationDataSchema,
  encodeRecommendation,
  decodeRecommendation,
} from "@merit/recommendations/domain";
import { fundingRoundSchema } from "@merit/rounds/domain";
import { encodeRound, decodeRound } from "@merit/rounds/domain";

import {
  fundingRoundOverviewSchema,
  applicationRecordSchema,
  type FundingRoundOverview,
  type ApplicationRecord,
} from "./model";

// Current records only; immutable case history keeps its independent frozen schema.
const applicationDataSchema = applicationRecordSchema.extend({
  requested: moneyDataSchema.nullable(),
  managerRecommendation: recommendationDataSchema.nullable(),
});
const fundingRoundDataSchema = fundingRoundSchema.extend({
  budget: moneyDataSchema.nullable(),
});
const fundingRoundOverviewDataSchema = fundingRoundDataSchema.extend({
  applications: z.array(applicationDataSchema),
});

export type FundingRoundOverviewData = z.infer<typeof fundingRoundOverviewDataSchema>;

export const encodeApplication = (input: ApplicationRecord) => {
  const application = applicationRecordSchema.parse(input);

  return {
    ...application,
    requested: application.requested === null ? null : encodeMoney(application.requested),
    managerRecommendation:
      application.managerRecommendation && encodeRecommendation(application.managerRecommendation),
  };
};

export const encodeRoundOverview = (input: FundingRoundOverview): FundingRoundOverviewData => {
  const round = fundingRoundOverviewSchema.parse(input);
  return { ...encodeRound(round), applications: round.applications.map(encodeApplication) };
};

export const decodeApplication = (input: unknown): ApplicationRecord => {
  const application = applicationDataSchema.parse(input);

  return applicationRecordSchema.parse({
    ...application,
    requested: application.requested === null ? null : decodeMoney(application.requested),
    managerRecommendation:
      application.managerRecommendation && decodeRecommendation(application.managerRecommendation),
  });
};

export const decodeRoundOverview = (input: unknown): FundingRoundOverview => {
  const round = fundingRoundOverviewDataSchema.parse(input);
  return { ...decodeRound(round), applications: round.applications.map(decodeApplication) };
};
