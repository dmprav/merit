import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { moneyDataSchema } from "@merit/money";
import { workspaceSlugSchema } from "@merit/organizations/api";

import { decisionOutcomes } from "../domain/decision-outcome";

// Field rules belong to the domain; the request only bounds what the server reads.
const text = z.string().max(10_000);

export const recordDecisionRequestSchema = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  publicId: publicIdSchema,
  /** The decision revision the person saw; 0 when none exists. */
  expectedRevision: z.number().int().nonnegative(),
  decision: z.strictObject({
    outcome: z.enum(decisionOutcomes),
    amount: moneyDataSchema,
    conditions: text,
    reason: text,
    decidedBy: text,
    decisionDate: text,
    /** Required once a decision exists; ignored for the first version. */
    changeExplanation: text.optional(),
  }),
});

export type RecordDecisionRequest = z.infer<typeof recordDecisionRequestSchema>;
