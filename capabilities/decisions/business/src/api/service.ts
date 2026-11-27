import type { Actor } from "@merit/auth";
import type { Money } from "@merit/money";

import type { DecisionIssueCode, DecisionVersion } from "../domain/decision";
import type { RecordDecisionRequest } from "./commands";

type NotFound = { status: "not_found" };

type Conflict = { status: "conflict" };

export type DecisionUpdateError =
  | DecisionIssueCode
  | "application_not_found"
  | "application_withdrawn"
  | "application_not_ready"
  | "committed_total_too_large";

export type DecisionBudgetFailure = {
  status: "invalid";
  error: "budget_required" | "commitment_exceeds_budget";
  budget: Money | null;
  committed: Money;
  excess: Money | null;
};

export type DecisionTotals = {
  committed: Money;
  available: Money | null;
  withdrawnApplications: number;
};

export interface DecisionsService {
  recordDecision: (
    actor: Actor,
    input: RecordDecisionRequest,
  ) => Promise<
    | {
        status: "ok";
        /** False when nothing changed, so no version was added. */
        recorded: boolean;
        decision: DecisionVersion;
        budget: Money | null;
        totals: DecisionTotals;
      }
    | NotFound
    | Conflict
    | { status: "invalid"; error: DecisionUpdateError }
    | DecisionBudgetFailure
  >;
}
