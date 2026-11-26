import { z } from "zod";

import { decisionOutcomes } from "@merit/decisions/domain";

const text = z.string();

export const decisionStorage = z.object({
  value: z.object({
    outcome: z.enum(decisionOutcomes),
    amount: text,
    conditions: text,
    reason: text,
    decidedBy: text,
    decisionDate: text,
    changeExplanation: text,
  }),
  baseline: z.object({ expectedRevision: z.number().int().nonnegative() }),
});
