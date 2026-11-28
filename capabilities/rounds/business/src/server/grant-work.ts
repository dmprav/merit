import type { Money } from "@merit/money";

import type { LockedFundingRound } from "./persistence/commands/locks";

export type RoundApplications = (locked: LockedFundingRound) => Promise<boolean>;

/** Funding committed to the round's non-withdrawn applications. */
export type RoundCommitments = (locked: LockedFundingRound) => Promise<Money>;
