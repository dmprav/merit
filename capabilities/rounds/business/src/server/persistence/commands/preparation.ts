import { and, eq, sql } from "drizzle-orm";

import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Transaction } from "@merit/db";
import type { LockedWorkspace } from "@merit/organizations/locks";

import { encodeRound, type FundingRoundData } from "../../../domain/encoding";
import type { FundingRound } from "../../../domain/model";
import type { prepareRoundChange } from "../../../domain/preparation";
import {
  fundingRounds,
  roundCreationReceipts,
  criteriaVersions,
  criteriaVersionItems,
} from "../schema";
import type { lockPreparationRoundAccess } from "./locks";

type PreparationState = NonNullable<Awaited<ReturnType<typeof lockPreparationRoundAccess>>>;

type CreationWorkspace = LockedWorkspace & { readonly workspaceMode: "update" };

export const readCreationReceipt = async (
  { tx, organizationId }: CreationWorkspace,
  requestId: string,
) => {
  const [row] = await tx
    .select({ publicId: roundCreationReceipts.publicId })
    .from(roundCreationReceipts)
    .where(
      and(
        eq(roundCreationReceipts.organizationId, organizationId),
        eq(roundCreationReceipts.requestId, requestId),
      ),
    );

  return row;
};

const roundColumns = (snapshot: FundingRoundData) => ({
  title: snapshot.title,
  purpose: snapshot.purpose,
  managerName: snapshot.manager,
  currency: snapshot.currency,
  budgetMinorUnits: snapshot.budget?.minorUnits ?? null,
  meetingDate: snapshot.meetingDate,
  snapshotDate: snapshot.snapshotDate,
  decisionStatus: snapshot.decisionStatus,
  criteriaVersion: snapshot.criteriaVersion,
});

const insertCriteriaHistoryEntries = async (
  tx: Transaction,
  roundPublicId: string,
  history: FundingRoundData["criteriaHistory"],
) => {
  if (history.length === 0) {
    return;
  }
  const inserted = await tx
    .insert(criteriaVersions)
    .values(history.map((entry) => ({ roundPublicId, version: entry.version })))
    .onConflictDoNothing()
    .returning({ version: criteriaVersions.version });
  const added = new Set(inserted.map((row) => row.version));
  const items = history
    .filter((entry) => added.has(entry.version))
    .flatMap((entry) =>
      entry.criteria.map((criterion, position) => ({
        roundPublicId,
        version: entry.version,
        position,
        id: criterion.id,
        title: criterion.title,
        description: criterion.description ?? null,
      })),
    );
  if (items.length > 0) {
    await tx.insert(criteriaVersionItems).values(items);
  }
};

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
    .values({
      ...identity,
      id: snapshot.id,
      ...roundColumns(snapshot),
      budgetEstablished: snapshot.budget !== null,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to insert prepared round.");
  }
  await insertCriteriaHistoryEntries(tx, row.id, snapshot.criteriaHistory);
  return row;
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
  await insertCriteriaHistoryEntries(tx, publicId, values.snapshot.criteriaHistory);
  await tx
    .update(fundingRounds)
    .set({
      ...roundColumns(values.snapshot),
      managerUserId: values.managerUserId,
      revision: values.revision,
      budgetEstablished: sql`${fundingRounds.budgetEstablished} or ${values.snapshot.budget !== null}`,
    })
    .where(eq(fundingRounds.id, publicId));
};

const actions = {
  create: "round.created",
  details: "round.details_changed",
  budget: "round.budget_changed",
  criteria: "round.criteria_changed",
  manager: "round.manager_changed",
  delete: "round.deleted",
} as const;

const recordRoundChange = async (
  tx: Transaction,
  values: {
    organizationId: string;
    publicId: string;
    revision: number;
    actorUserId: string;
    provenance: ReturnType<typeof actorProvenance>;
    action: keyof typeof actions;
    reason?: string | null;
    before?: FundingRoundData;
    after?: FundingRoundData;
  },
) => {
  await recordAuditEvent(tx, {
    organizationId: values.organizationId,
    actor: { userId: values.actorUserId, provenance: values.provenance },
    action: actions[values.action],
    target: {
      type: "round",
      id: values.publicId,
      revision: values.revision,
      name: (values.after ?? values.before)?.title,
    },
    context: { roundId: values.publicId },
    details: {
      reason: values.reason ?? null,
      before: values.before ?? null,
      after: values.after ?? null,
    },
  });
};

export const recordPreparationCreation = async (
  { tx, organizationId }: CreationWorkspace & { readonly authorityLocked: true },
  round: FundingRound,
  actor: Actor,
  requestId: string,
  budgetReason?: string,
) => {
  const snapshot = encodeRound(round);
  const saved = await insertPreparedRound(tx, {
    organizationId,
    snapshot,
    managerUserId: actor.userId,
  });
  await tx.insert(roundCreationReceipts).values({ organizationId, publicId: saved.id, requestId });
  await recordRoundChange(tx, {
    organizationId,
    publicId: saved.id,
    revision: 0,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    action: "create",
    reason: budgetReason,
    after: snapshot,
  });
  return saved.id;
};

/** Unchanged saves preserve their revision. */
export const recordPreparationChange = async (
  current: PreparationState,
  change: Omit<Extract<ReturnType<typeof prepareRoundChange>, { ok: true }>, "ok">,
  actor: Actor,
) => {
  if (!change.changed) {
    return current.revision;
  }

  const snapshot = encodeRound(change.round);
  const revision = current.revision + 1;
  await writePreparedRound(current.tx, current.id, {
    snapshot,
    managerUserId: change.round.managerUserId ?? null,
    revision,
  });
  await recordRoundChange(current.tx, {
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

/** The caller has checked revision and emptiness. */
export const recordPreparationDeletion = async (current: PreparationState, actor: Actor) => {
  await recordRoundChange(current.tx, {
    organizationId: current.organizationId,
    publicId: current.id,
    revision: current.revision + 1,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    action: "delete",
    before: encodeRound(current.round),
  });
  await current.tx.delete(fundingRounds).where(eq(fundingRounds.id, current.id));
};
