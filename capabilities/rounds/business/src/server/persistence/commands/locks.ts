import { and, eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";
import { lockWorkspaceRow, lockGrantActor, type LockedWorkspace } from "@merit/organizations/locks";

import { decodeRound } from "../../../domain/encoding";
import { readRoundRecord } from "../projections";
import { fundingRounds } from "../schema";

const roundLock = Symbol("locked funding round");

export const lockFundingRound = async <Mode extends "share" | "update">(
  workspace: LockedWorkspace & { readonly roundId?: never },
  roundId: string,
  roundMode: Mode,
) => {
  const [round] = await workspace.tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .where(
      and(
        eq(fundingRounds.organizationId, workspace.organizationId),
        eq(fundingRounds.id, roundId),
      ),
    )
    .for(roundMode);
  return round
    ? ({ ...workspace, [roundLock]: true, roundId: round.id, roundMode } as const)
    : null;
};

export type LockedFundingRound = NonNullable<Awaited<ReturnType<typeof lockFundingRound>>>;

const readPreparationRound = async ({ tx, organizationId, roundId }: LockedFundingRound) => {
  const [row] = await tx
    .select({
      id: fundingRounds.id,
      organizationId: fundingRounds.organizationId,
      revision: fundingRounds.revision,
      budgetEstablished: fundingRounds.budgetEstablished,
    })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)));
  if (!row) {
    return undefined;
  }
  const snapshot = await readRoundRecord(tx, organizationId, roundId);
  if (!snapshot) {
    return undefined;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    revision: row.revision,
    round: decodeRound(snapshot),
    budgetEstablished: row.budgetEstablished,
  };
};

export const lockPreparationRoundAccess = async (
  tx: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) => {
  const workspace = await lockWorkspaceRow(tx, { slug: input.workspaceSlug, userId }, "share");
  const locked = workspace && (await lockFundingRound(workspace, input.publicId, "update"));
  if (!locked || !(await lockGrantActor(locked, userId))) {
    return null;
  }
  const round = await readPreparationRound(locked);
  return round ? { ...locked, ...round, organizationKind: locked.organization.kind } : null;
};
