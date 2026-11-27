import type { Actor } from "@merit/auth";
import type { Transaction } from "@merit/db";

/** Downstream review work, supplied by Reviews. */
export type ApplicationReviewWork = {
  /** Whether any review request or assessment exists for the case, including a cancelled request. */
  hasActivity: (tx: Transaction, caseId: string) => Promise<boolean>;
  /** Closes every outstanding review request and ends the reviewer access linked to each. */
  closeForWithdrawal: (
    tx: Transaction,
    input: { caseId: string; actor: Actor; name: string },
  ) => Promise<void>;
};

/** Downstream recommendation work, supplied by Recommendations. */
export type ApplicationRecommendationWork = {
  /** Whether any recommendation version exists for the case. */
  hasRecommendation: (tx: Transaction, caseId: string) => Promise<boolean>;
  /** Whether counting the case's recommended allocation again would overflow the round's total. */
  allocationTotalProblem: (
    tx: Transaction,
    input: { organizationId: string; roundId: string; caseId: string },
  ) => Promise<"allocation_total_too_large" | null>;
};

/** Downstream committee decision work, supplied by Decisions. */
export type ApplicationDecisionWork = {
  /** Whether any decision version exists for the case. */
  hasDecision: (tx: Transaction, caseId: string) => Promise<boolean>;
  /** Whether the case's current decision commits funding (Fund or Fund with conditions). */
  hasCommitment: (tx: Transaction, caseId: string) => Promise<boolean>;
};

/** Collaborators use the caller's transaction and existing workspace/round/case locks. */
export type ApplicationWork = {
  reviews: ApplicationReviewWork;
  recommendations: ApplicationRecommendationWork;
  decisions: ApplicationDecisionWork;
};
