import type { Transaction } from "@merit/db";

/** Read application existence in the supplied transaction while the caller holds the round lock. */
export type RoundApplications = (
  tx: Transaction,
  organizationId: string,
  roundId: string,
) => Promise<boolean>;
