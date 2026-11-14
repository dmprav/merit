import { eq } from "drizzle-orm";

import type { Database } from "@merit/db";

import { fundingRounds, roundCreationReceipts } from "./persistence/schema";

export { insertPreparedRound } from "./persistence/commands/preparation";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const deleteDemoRounds = async (db: Transaction, organizationId: string) => {
  await db
    .delete(roundCreationReceipts)
    .where(eq(roundCreationReceipts.organizationId, organizationId));
  await db.delete(fundingRounds).where(eq(fundingRounds.organizationId, organizationId));
};
