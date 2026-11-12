import type { Database } from "@merit/db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Read application existence in the supplied transaction while the caller holds the round lock. */
export type RoundApplications = (
  tx: Transaction,
  organizationId: string,
  roundId: string,
) => Promise<boolean>;
