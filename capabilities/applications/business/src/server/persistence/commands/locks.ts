import { and, eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";
import { lockWorkspaceRow, lockGrantActor } from "@merit/organizations/locks";
import { lockFundingRound, type LockedFundingRound } from "@merit/rounds/locks";

import { caseWithdrawn } from "../projections";
import { applicationCases } from "../schema";

const caseLock = Symbol("locked application case");

export const lockCaseRow = async (
  round: LockedFundingRound & { readonly caseId?: never },
  caseId: string,
) => {
  const [row] = await round.tx
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.id, caseId),
        eq(applicationCases.organizationId, round.organizationId),
        eq(applicationCases.roundId, round.roundId),
      ),
    )
    .for("update");
  return row ? ({ ...round, [caseLock]: true, caseId: row.id } as const) : null;
};

export type LockedApplicationCase = NonNullable<Awaited<ReturnType<typeof lockCaseRow>>>;

export const readCaseWithdrawn = async ({ tx, caseId }: LockedApplicationCase) => {
  const [row] = await tx
    .select({ withdrawn: caseWithdrawn })
    .from(applicationCases)
    .where(eq(applicationCases.id, caseId));
  return row?.withdrawn ?? false;
};

export const lockApplicationCase = async (
  tx: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
  roundMode: "share" | "update" = "share",
) => {
  const workspace = await lockWorkspaceRow(tx, { slug: input.workspaceSlug, userId }, "share");
  if (!workspace) {
    return null;
  }
  const [identity] = await tx
    .select({ roundId: applicationCases.roundId })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.id, input.publicId),
        eq(applicationCases.organizationId, workspace.organizationId),
      ),
    );
  const round = identity && (await lockFundingRound(workspace, identity.roundId, roundMode));
  const locked = round && (await lockCaseRow(round, input.publicId));
  const actor = locked && (await lockGrantActor(locked, userId));
  return locked && actor
    ? {
        ...locked,
        organizationKind: locked.organization.kind,
        withdrawn: await readCaseWithdrawn(locked),
        actor,
      }
    : null;
};
