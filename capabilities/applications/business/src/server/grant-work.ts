import type { Actor } from "@merit/auth";

import type { LockedApplicationCase } from "./persistence/commands/locks";

/** Downstream review work, supplied by Reviews. */
export type ApplicationReviewWork = {
  /** Whether any review request or assessment exists for the case, including a cancelled request. */
  hasActivity: (locked: LockedApplicationCase) => Promise<boolean>;
  /** Closes every outstanding review request and ends the reviewer access linked to each. */
  closeForWithdrawal: (
    locked: LockedApplicationCase,
    input: { actor: Actor; name: string },
  ) => Promise<void>;
};

/** Downstream recommendation work, supplied by Recommendations. */
export type ApplicationRecommendationWork = {
  /** Whether any recommendation version exists for the case. */
  hasRecommendation: (locked: LockedApplicationCase) => Promise<boolean>;
  /** Whether counting the case's recommended allocation again would overflow the round's total. */
  allocationTotalProblem: (
    locked: LockedApplicationCase,
  ) => Promise<"allocation_total_too_large" | null>;
};

/** Downstream committee decision work, supplied by Decisions. */
export type ApplicationDecisionWork = {
  /** Whether any decision version exists for the case. */
  hasDecision: (locked: LockedApplicationCase) => Promise<boolean>;
  /** Whether the case's current decision commits funding (Fund or Fund with conditions). */
  hasCommitment: (locked: LockedApplicationCase) => Promise<boolean>;
};

export type ApplicationWork = {
  reviews: ApplicationReviewWork;
  recommendations: ApplicationRecommendationWork;
  decisions: ApplicationDecisionWork;
};
