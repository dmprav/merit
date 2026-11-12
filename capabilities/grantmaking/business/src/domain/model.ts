import { z } from "zod";

import { intakeApplicationSchema } from "@merit/applications/domain";
import { recommendationSchema } from "@merit/recommendations/domain";
import { reviewStateSchema } from "@merit/reviews/domain";
import { fundingRoundSchema } from "@merit/rounds/domain";

export const applicationRecordSchema = intakeApplicationSchema.extend({
  reviews: reviewStateSchema,
  managerRecommendation: recommendationSchema.nullable(),
});
export const fundingRoundOverviewSchema = fundingRoundSchema.extend({
  applications: z.array(applicationRecordSchema),
});

export type ApplicationRecord = z.infer<typeof applicationRecordSchema>;

export type FundingRoundOverview = z.infer<typeof fundingRoundOverviewSchema>;
