import { and, eq } from "drizzle-orm";

import { actorProvenance, type Actor } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships } from "@merit/organizations/schema";
import { membershipScope } from "@merit/organizations/scope";

import type { FundingRound } from "../../../domain/model";
import type { prepareRoundChange } from "../../../domain/preparation";
import { decodeRound, encodeRound, type FundingRoundData } from "../encoding";
import { roundRecord } from "../projections";
import { fundingRounds, roundChanges, criteriaVersions } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const lockPreparationRound = async (
  tx: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await tx
    .select({
      id: fundingRounds.id,
      organizationId: fundingRounds.organizationId,
      revision: fundingRounds.revision,
      snapshot: roundRecord,
    })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, publicId)))
    .for("update");

  return (
    row && {
      id: row.id,
      organizationId: row.organizationId,
      revision: row.revision,
      round: decodeRound(row.snapshot),
    }
  );
};

type PreparationState = NonNullable<Awaited<ReturnType<typeof lockPreparationRound>>>;

export const readCreationReceipt = async (
  tx: Transaction,
  organizationId: string,
  requestId: string,
) => {
  const [row] = await tx
    .select({ publicId: roundChanges.publicId })
    .from(roundChanges)
    .where(
      and(eq(roundChanges.organizationId, organizationId), eq(roundChanges.requestId, requestId)),
    );

  return row;
};

const roundColumns = (snapshot: FundingRoundData) => ({
  title: snapshot.title,
  purpose: snapshot.purpose,
  managerName: snapshot.manager,
  currency: snapshot.currency,
  budget: snapshot.budget?.minorUnits ?? null,
  meetingDate: snapshot.meetingDate,
  snapshotDate: snapshot.snapshotDate,
  decisionStatus: snapshot.decisionStatus,
  criteriaVersion: snapshot.criteriaVersion,
});

export const insertPreparedRound = async (
  tx: Transaction,
  values: {
    organizationId: string;
    managerUserId: string | null;
    snapshot: FundingRoundData;
  },
) => {
  const { snapshot, ...identity } = values;
  const [row] = await tx
    .insert(fundingRounds)
    .values({ ...identity, id: snapshot.id, ...roundColumns(snapshot) })
    .returning();
  await tx.insert(criteriaVersions).values(
    snapshot.criteriaHistory.map((entry) => ({
      roundPublicId: row!.id,
      version: entry.version,
      criteria: entry.criteria,
    })),
  );
  return row!;
};

const writePreparedRound = async (
  tx: Transaction,
  publicId: string,
  values: {
    snapshot: FundingRoundData;
    managerUserId: string | null;
    revision: number;
  },
) => {
  await tx
    .insert(criteriaVersions)
    .values(
      values.snapshot.criteriaHistory.map((entry) => ({
        roundPublicId: publicId,
        version: entry.version,
        criteria: entry.criteria,
      })),
    )
    .onConflictDoNothing();
  await tx
    .update(fundingRounds)
    .set({
      ...roundColumns(values.snapshot),
      managerUserId: values.managerUserId,
      revision: values.revision,
    })
    .where(eq(fundingRounds.id, publicId));
};

const recordRoundChange = (tx: Transaction, values: typeof roundChanges.$inferInsert) =>
  tx.insert(roundChanges).values(values);

export const hasRoundBudgetHistory = async (tx: Transaction, publicId: string) => {
  const rows = await tx
    .select({ revision: roundChanges.revision })
    .from(roundChanges)
    .where(and(eq(roundChanges.publicId, publicId), eq(roundChanges.action, "budget")))
    .limit(1);
  return rows.length > 0;
};

/** The caller holds the workspace lock until the round and creation receipt commit together. */
export const recordPreparationCreation = async (
  tx: Transaction,
  organizationId: string,
  round: FundingRound,
  actor: Actor,
  requestId: string,
) => {
  const snapshot = encodeRound(round);
  const saved = await insertPreparedRound(tx, {
    organizationId,
    snapshot,
    managerUserId: actor.userId,
  });
  await recordRoundChange(tx, {
    organizationId,
    publicId: saved.id,
    revision: 0,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    action: "create",
    requestId,
    after: snapshot,
  });
  return saved.id;
};

/** The caller retains authorization and round locks; unchanged saves preserve their revision. */
export const recordPreparationChange = async (
  tx: Transaction,
  current: PreparationState,
  change: Omit<Extract<ReturnType<typeof prepareRoundChange>, { ok: true }>, "ok">,
  actor: Actor,
) => {
  if (!change.changed) {
    return current.revision;
  }

  const snapshot = encodeRound(change.round);
  const revision = current.revision + 1;
  await writePreparedRound(tx, current.id, {
    snapshot,
    managerUserId: change.round.managerUserId ?? null,
    revision,
  });
  await recordRoundChange(tx, {
    organizationId: current.organizationId,
    publicId: current.id,
    revision,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    action: change.action,
    reason: change.reason,
    before: encodeRound(current.round),
    after: snapshot,
  });
  return revision;
};

/** The caller has checked revision and emptiness while holding workspace and round locks. */
export const recordPreparationDeletion = async (
  tx: Transaction,
  current: PreparationState,
  actor: Actor,
) => {
  await recordRoundChange(tx, {
    organizationId: current.organizationId,
    publicId: current.id,
    revision: current.revision + 1,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    action: "delete",
    before: encodeRound(current.round),
  });
  await tx.delete(fundingRounds).where(eq(fundingRounds.id, current.id));
};

export const lockManagerCandidate = async (
  tx: Transaction,
  organizationId: string,
  userId: string,
) => {
  const [row] = await tx
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(appUsers.id, userId),
        membershipScope("work_on_grants", organizationId),
      ),
    )
    .for("share", { of: [memberships, appUsers] });

  return row;
};
