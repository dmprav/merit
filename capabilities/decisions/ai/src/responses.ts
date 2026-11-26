import { publicIdSchema } from "@merit/db/identifiers";
import {
  budgetFailureDataSchema,
  encodeDecisionResult,
  savedDecisionDataSchema,
  type DecisionsService,
} from "@merit/decisions/api";

export const savedDecisionSchema = savedDecisionDataSchema.extend({
  applicationId: publicIdSchema,
});

export const budgetFailureSchema = budgetFailureDataSchema;

export const presentDecision = (
  result: Awaited<ReturnType<DecisionsService["recordDecision"]>>,
  applicationId: string,
) => {
  const encoded = encodeDecisionResult(result);
  return encoded.status === "ok" ? { ...encoded, applicationId } : encoded;
};
