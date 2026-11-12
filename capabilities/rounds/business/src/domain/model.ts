import { z } from "zod";

import { calendarDateSchema } from "@merit/dates";
import { moneySchema, isNegative } from "@merit/money";

import { reviewCriteriaSchema } from "./criteria";
import { criteriaVersionSchema } from "./versions";

const amount = moneySchema.refine((value) => !isNegative(value), "Amount must be nonnegative");

const criterionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().optional(),
});
export const fundingRoundSchema = z.object({
  id: z.string(),
  title: z.string(),
  foundation: z.string(),
  purpose: z.string(),
  manager: z.string(),
  managerUserId: z.string().nullable().optional(),
  managerNeedsReassignment: z.boolean().optional(),
  currency: z.literal("EUR"),
  budget: amount.nullable(),
  meetingDate: calendarDateSchema.nullable(),
  snapshotDate: calendarDateSchema,
  decisionStatus: z.string(),
  criteria: z.array(criterionSchema),
  criteriaVersion: criteriaVersionSchema,
  criteriaHistory: z.array(
    z.object({ version: criteriaVersionSchema, criteria: reviewCriteriaSchema }),
  ),
});

export type FundingRound = z.infer<typeof fundingRoundSchema>;
