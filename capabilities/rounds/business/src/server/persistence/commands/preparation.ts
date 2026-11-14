import { and, eq, sql } from "drizzle-orm";

import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { membershipScope, organizationScope } from "@merit/organizations/scope";

import type { FundingRound } from "../../../domain/model";
import type { prepareRoundChange } from "../../../domain/preparation";
import { decodeRound, encodeRound, type FundingRoundData } from "../encoding";
import { roundRecord } from "../projections";
import { fundingRounds, roundCreationReceipts, criteriaVersions } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const readPreparationRound = async (tx: Transaction, organizationId: string, publicId: string) => {
  const [row] = await tx
    .select({
      id: fundingRounds.id,
      organizationId: fundingRounds.organizationId,
      revision: fundingRounds.revision,
      snapshot: roundRecord,
      budgetEstablished: fundingRounds.budgetEstablished,
    })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, publicId)));

  return (
    row && {
      id: row.id,
      organizationId: row.organizationId,
      revision: row.revision,
      round: decodeRound(row.snapshot),
      budgetEstablished: row.budgetEstablished,
    }
  );
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

  const [lockedRound] = await tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .innerJoin(memberships, eq(memberships.organizationId, fundingRounds.organizationId))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(fundingRounds.organizationId, workspace.id),
        eq(fundingRounds.id, input.publicId),
        organizationScope(userId, "work_on_grants", fundingRounds.organizationId),
      ),
    )
    .for("update", { of: fundingRounds });
  if (!lockedRound) {
    return null;
  }

  const [actor] = await tx
    .select({ userId: appUsers.id, name: appUsers.name, email: memberships.email })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, workspace.id),
        organizationScope(userId, "work_on_grants", workspace.id),
      ),
    )
    .for("share", { of: [memberships, appUsers] });
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
    .values({
      ...identity,
      id: snapshot.id,
      ...roundColumns(snapshot),
      budgetEstablished: snapshot.budget !== null,
    })
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
