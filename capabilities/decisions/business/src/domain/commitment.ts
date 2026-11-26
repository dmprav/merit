import { add, fromMinorUnits, isNegative, subtract, sum, type Money } from "@merit/money";

import { commitsFunding, type DecisionOutcome } from "./decision-outcome";

type DecisionFacts = { outcome: DecisionOutcome; amount: Money };

/** What a decision reserves from the round budget: its amount when it commits funding, else nothing. */
export const commitmentOf = (decision: DecisionFacts | null) =>
  decision && commitsFunding(decision.outcome) ? decision.amount : fromMinorUnits(0n);

/** Funding is only committed to an application that is past preparation and states what it requests. */
export const readyForFunding = (application: { intakeStatus: string; requested: unknown }) =>
  application.intakeStatus !== "in_preparation" && application.requested !== null;

export const commitmentTotals = (budget: Money | null, commitments: readonly Money[]) => {
  const committed = sum(commitments);
  return { committed, available: budget === null ? null : subtract(budget, committed) };
};

/** Committed funding must stay within the money contract for totals to be recorded and read. */
export const commitmentTotalProblem = (commitments: readonly Money[]) => {
  try {
    sum(commitments);
    return null;
  } catch (error) {
    if (error instanceof RangeError) {
      return "committed_total_too_large" as const;
    }
    throw error;
  }
};

export type CommitmentPreview =
  | { ok: true; totals: { committed: Money; available: Money | null } }
  | { ok: false; error: "committed_total_too_large" }
  | {
      ok: false;
      error: "budget_required" | "commitment_exceeds_budget";
      budget: Money | null;
      committed: Money;
      excess: Money | null;
    };

/**
 * The round's commitments after this application's current decision is replaced.
 * Only a commitment is held to the budget: Defer and Decline are never blocked by it.
 */
export const previewCommitment = (
  round: { budget: Money | null; committed: Money },
  current: DecisionFacts | null,
  next: DecisionFacts,
): CommitmentPreview => {
  let committed: Money;
  try {
    committed = add(subtract(round.committed, commitmentOf(current)), commitmentOf(next));
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, error: "committed_total_too_large" };
    }
    throw error;
  }
  const available = round.budget === null ? null : subtract(round.budget, committed);
  if (!commitsFunding(next.outcome)) {
    return { ok: true, totals: { committed, available } };
  }
  if (round.budget === null || available === null) {
    return { ok: false, error: "budget_required", budget: null, committed, excess: null };
  }
  if (isNegative(available)) {
    return {
      ok: false,
      error: "commitment_exceeds_budget",
      budget: round.budget,
      committed,
      excess: subtract(committed, round.budget),
    };
  }
  return { ok: true, totals: { committed, available } };
};
