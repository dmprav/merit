import { eq } from "drizzle-orm";

import type { Database } from "@merit/db";
import { fromMinorUnits } from "@merit/money";
import { workspaceSlug } from "@merit/organizations/testing/workspace";
import { readRoundBudgetHistory } from "@merit/rounds/readers";
import { fundingRounds } from "@merit/rounds/schema";
import { readRoundCriteria } from "@merit/rounds/scope";

export const noRoundCommitments = async () => fromMinorUnits(0n);

export const noRoundApplications = async () => false;

export const readPersistedRound = async (db: Database, id: string) => {
  const [round] = await db.select().from(fundingRounds).where(eq(fundingRounds.id, id));
  const criteria = await readRoundCriteria(db, workspaceSlug, id);
  const budgetHistory = await readRoundBudgetHistory(db, workspaceSlug, id);
  return { round, criteria, budgetHistory: budgetHistory.entries };
};
