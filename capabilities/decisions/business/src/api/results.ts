import { z } from "zod";

import { encodeMoney, moneyDataSchema } from "@merit/money";

import { decisionVersionDataSchema, encodeDecision } from "../domain/encoding";
import type { DecisionsService } from "./service";

export const savedDecisionDataSchema = z.object({
  status: z.literal("ok"),
  /** False when nothing changed, so no version was added. */
  recorded: z.boolean(),
  decision: decisionVersionDataSchema,
  budget: moneyDataSchema.nullable(),
  totals: z.object({
    committed: moneyDataSchema,
    available: moneyDataSchema.nullable(),
    withdrawnApplications: z.number().int().nonnegative(),
  }),
});

/** A commitment the round budget cannot hold, with the figures that explain it. */
export const budgetFailureDataSchema = z.object({
  status: z.literal("invalid"),
  error: z.enum(["budget_required", "commitment_exceeds_budget"]),
  budget: moneyDataSchema.nullable(),
  committed: moneyDataSchema,
  excess: moneyDataSchema.nullable(),
});

type ServiceResult = Awaited<ReturnType<DecisionsService["recordDecision"]>>;

/** A transport can fail before the operation runs. */
type TransportFailure = { status: "signed_out" | "unavailable" };

const isTransportFailure = (result: ServiceResult | TransportFailure): result is TransportFailure =>
  result.status === "signed_out" || result.status === "unavailable";

const encodeServiceResult = (result: ServiceResult) => {
  if (result.status === "ok") {
    return {
      status: "ok" as const,
      recorded: result.recorded,
      decision: {
        revision: result.decision.revision,
        decision: encodeDecision(result.decision.decision),
      },
      budget: result.budget === null ? null : encodeMoney(result.budget),
      totals: {
        committed: encodeMoney(result.totals.committed),
        available: result.totals.available === null ? null : encodeMoney(result.totals.available),
        withdrawnApplications: result.totals.withdrawnApplications,
      },
    };
  }
  if (result.status === "invalid" && "committed" in result) {
    return {
      status: "invalid" as const,
      error: result.error,
      budget: result.budget === null ? null : encodeMoney(result.budget),
      committed: encodeMoney(result.committed),
      excess: result.excess === null ? null : encodeMoney(result.excess),
    };
  }
  return result;
};

/** Money does not serialize; a transport encodes the service result before it leaves the server. */
export function encodeDecisionResult(result: ServiceResult): ReturnType<typeof encodeServiceResult>;
export function encodeDecisionResult(
  result: ServiceResult | TransportFailure,
): ReturnType<typeof encodeServiceResult> | TransportFailure;

export function encodeDecisionResult(result: ServiceResult | TransportFailure) {
  return isTransportFailure(result) ? result : encodeServiceResult(result);
}

export type EncodedDecisionResult = ReturnType<typeof encodeServiceResult> | TransportFailure;
