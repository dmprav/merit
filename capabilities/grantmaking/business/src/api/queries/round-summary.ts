import { z } from "zod";

import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";
import { fundingRoundSchema } from "@merit/rounds/domain";

const summaryFields = {
  organizationId: z.string().min(1),
  organizationName: z.string().min(1),
  workspaceSlug: z.string().min(1),
  publicId: z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/),
  title: z.string(),
  decisionStatus: z.string(),
  applicationCount: z.number().int().nonnegative(),
  meetingDate: fundingRoundSchema.shape.meetingDate,
};
const roundSummarySchema = z.object({
  ...summaryFields,
  budget: fundingRoundSchema.shape.budget,
});
const roundSummaryDataSchema = z.object({
  ...summaryFields,
  budget: moneyDataSchema.nullable(),
});

export type RoundSummary = z.infer<typeof roundSummarySchema>;

export const encodeRoundSummary = (input: RoundSummary) => {
  const summary = roundSummarySchema.parse(input);
  return { ...summary, budget: summary.budget === null ? null : encodeMoney(summary.budget) };
};

export const decodeRoundSummary = (input: unknown): RoundSummary => {
  const summary = roundSummaryDataSchema.parse(input);
  return roundSummarySchema.parse({
    ...summary,
    budget: summary.budget === null ? null : decodeMoney(summary.budget),
  });
};
