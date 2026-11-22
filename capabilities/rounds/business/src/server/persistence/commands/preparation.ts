import { and, eq, sql } from "drizzle-orm";

import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Transaction } from "@merit/db";
import { lockGrantActor } from "@merit/organizations/locks";
import { organizations } from "@merit/organizations/schema";
import { authorizedWorkspaces } from "@merit/organizations/scope";

import { decodeRound, encodeRound, type FundingRoundData } from "../../../domain/encoding";
import type { FundingRound } from "../../../domain/model";
import type { prepareRoundChange } from "../../../domain/preparation";
import { readRoundRecord } from "../projections";
import {
  fundingRounds,
  roundCreationReceipts,
  criteriaVersions,
  criteriaVersionItems,
} from "../schema";

const readPreparationRound = async (tx: Transaction, organizationId: string, publicId: string) => {
  const [row] = await tx
    .select({
      id: fundingRounds.id,
      organizationId: fundingRounds.organizationId,
      revision: fundingRounds.revision,
      budgetEstablished: fundingRounds.budgetEstablished,
    })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, publicId)));
  if (!row) {
    return undefined;
  }
  const snapshot = await readRoundRecord(tx, organizationId, publicId);
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

export const lockPreparationRound = async (
  tx: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [locked] = await tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, publicId)))
    .for("update");
  if (!locked) {
    return undefined;
  }

  return readPreparationRound(tx, organizationId, publicId);
};

/**
 * Canonical grant-work lock hierarchy:
 * organizations -> funding_rounds -> application_cases -> review_assignments -> memberships / app_users.
 */
export const lockPreparationRoundAccess = async (
  tx: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) => {
  const [workspace] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.workspaceSlug))
    .for("share");
  if (!workspace) {
    return null;
  }

  const access = authorizedWorkspaces(tx, userId, "work_on_grants", input.workspaceSlug);
  const [lockedRound] = await tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .innerJoin(access, eq(access.id, fundingRounds.organizationId))
    .where(
      and(eq(fundingRounds.organizationId, workspace.id), eq(fundingRounds.id, input.publicId)),
    )
    .for("update", { of: fundingRounds });
  if (!lockedRound) {
    return null;
  }

  const actor = await lockGrantActor(tx, userId, workspace.id);
  if (!actor) {
    return null;
  }

  return (await readPreparationRound(tx, workspace.id, input.publicId)) ?? null;
};

type PreparationState = NonNullable<Awaited<ReturnType<typeof lockPreparationRound>>>;

export const readCreationReceipt = async (
  tx: Transaction,
  organizationId: string,
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
  await tx.insert(roundCreationReceipts).values({ organizationId, publicId: saved.id, requestId });
  await recordRoundChange(tx, {
    organizationId,
    publicId: saved.id,
    revision: 0,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    action: "create",
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
  return lockGrantActor(tx, userId, organizationId);
};
