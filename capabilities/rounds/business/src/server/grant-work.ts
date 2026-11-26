import type { Transaction } from "@merit/db";
import type { Money } from "@merit/money";

/** Read application existence in the supplied transaction while the caller holds the round lock. */
export type RoundApplications = (
  tx: Transaction,
  organizationId: string,
  roundId: string,
) => Promise<boolean>;

/** The funding the round's non-withdrawn applications have committed, read under the round lock. */
export type RoundCommitments = (
  tx: Transaction,
  organizationId: string,
  roundId: string,
) => Promise<Money>;
