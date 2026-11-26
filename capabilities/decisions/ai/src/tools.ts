import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import { writeErrorSchema, revision } from "@merit/ai/contracts";
import type { Actor } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import { recordDecisionRequestSchema, type DecisionsService } from "@merit/decisions/api";
import { decisionLimits } from "@merit/decisions/domain";

import { budgetFailureSchema, presentDecision, savedDecisionSchema } from "./responses";

const decisionFields = recordDecisionRequestSchema.shape.decision.shape;

export const createDecisionTools = (actor: Actor, decisions: DecisionsService) => [
  defineActorTool(
    actor,
    "record_committee_decision",
    {
      errorSchema: z.union([budgetFailureSchema, writeErrorSchema]),
      description: `Record the funding decision a committee made outside Merit, as a new version of the application's decision. This is separate from save_recommendation: a recommendation is a proposal, while a recorded Fund or Fund with conditions decision commits funding against the round budget. Outcomes: Fund (amount above €0), Fund with conditions (amount above €0 and conditions text), Defer and Decline (amount exactly €0, no conditions). Amounts are EUR minor-unit strings with no rounding. Every version needs a reason (up to ${decisionLimits.reasonLength} characters), decidedBy naming the deciding body such as "Funding committee" (up to ${decisionLimits.decidedByLength} characters), and a decisionDate that is not in the future. Merit records the actor, client, and time separately from decidedBy. Use decisionRevision from get_application as expectedDecisionRevision; use 0 for the first decision. Any later version, including a correction or a later meeting's decision after a Defer, also needs changeExplanation (up to ${decisionLimits.changeExplanationLength} characters). Saving no change records nothing and returns recorded false. Funding needs ready application material and a round budget, and the committed total may not exceed the budget: a rejection returns the budget, committed total, and excess. A withdrawn application accepts no decision. A recommendation is not required and is never changed by a decision.`,
      inputSchema: z.strictObject({
        workspaceSlug: recordDecisionRequestSchema.shape.workspaceSlug,
        applicationId: publicIdSchema,
        outcome: decisionFields.outcome,
        amount: decisionFields.amount,
        conditions: decisionFields.conditions.default(""),
        reason: decisionFields.reason,
        decidedBy: decisionFields.decidedBy,
        decisionDate: decisionFields.decisionDate.describe("Calendar date as YYYY-MM-DD."),
        changeExplanation: decisionFields.changeExplanation,
        expectedDecisionRevision: revision,
      }),
      outputSchema: savedDecisionSchema,
    },
    async ({ workspaceSlug, applicationId, expectedDecisionRevision, ...decision }) =>
      presentDecision(
        await decisions.recordDecision(actor, {
          workspaceSlug,
          publicId: applicationId,
          expectedRevision: expectedDecisionRevision,
          decision,
        }),
        applicationId,
      ),
  ),
];
