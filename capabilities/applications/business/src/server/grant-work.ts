import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import type { ApplicationUsage } from "../domain/model";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Collaborators use the caller's transaction and existing workspace/round/case locks. */
export type ApplicationWork = {
  usage: (tx: Transaction, organizationId: string, caseId: string) => Promise<ApplicationUsage>;
  /** Whether counting the case's recommended allocation again would overflow the round's total. */
  allocationTotalProblem: (
    tx: Transaction,
    input: { organizationId: string; roundId: string; caseId: string },
  ) => Promise<"allocation_total_too_large" | null>;
  /** Closes every outstanding review request and ends the reviewer access linked to each. */
  closeReviewsForWithdrawal: (
    tx: Transaction,
    input: { caseId: string; actor: Actor; name: string },
  ) => Promise<void>;
};
