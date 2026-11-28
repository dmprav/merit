import { and, eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";
import { lockWorkspaceRow, lockGrantActor, type LockedWorkspace } from "@merit/organizations/locks";

import { decodeRound } from "../../../domain/encoding";
import { readRoundRecord } from "../projections";
import { fundingRounds } from "../schema";

const roundLock = Symbol("locked funding round");

type RoundLockMode = "share" | "update";

export type LockedFundingRound<Mode extends RoundLockMode = RoundLockMode> = LockedWorkspace & {
  readonly [roundLock]: true;
  readonly roundId: string;
  readonly roundMode: Mode;
};

export const lockFundingRound = async <Mode extends RoundLockMode>(
  workspace: LockedWorkspace & { readonly roundId?: never; readonly authorityLocked?: never },
  roundId: string,
  roundMode: Mode,
): Promise<LockedFundingRound<Mode> | null> => {
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
  const access = locked && (await lockGrantActor(locked, userId));
  if (!access) {
    return null;
  }
  const round = await readPreparationRound(access);
  return round ? { ...access, ...round, organizationKind: access.organization.kind } : null;
};
