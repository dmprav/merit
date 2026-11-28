import { and, eq, sql } from "drizzle-orm";

import { lockCaseRow, type LockedApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";
import type { Database, Transaction } from "@merit/db";
import { lockWorkspaceRow, lockGrantActor } from "@merit/organizations/locks";
import { lockFundingRound } from "@merit/rounds/locks";

import type { ReviewerDraft } from "../../../domain/reviewer";
import { provenanceColumns } from "../projections";
import { latestReviewerMessage, readReviewerRecord } from "../reviewer-records";
import {
  reviewerDraftObservations,
  reviewerDrafts,
  reviewAssignments,
  reviewerCommandReceipts,
  reviewerMessages,
} from "../reviewer-schema";
import { reviewRequests, reviewStates } from "../schema";

const assignmentLock = Symbol("locked reviewer assignment");

const lockAssignmentRow = async (
  locked: LockedApplicationCase & { authorityLocked?: never; assignmentId?: never },
  assignmentId: string,
): Promise<LockedReviewerAssignment | null> => {
  const [row] = await locked.tx
    .select({ id: reviewAssignments.id })
    .from(reviewAssignments)
    .where(
      and(
        eq(reviewAssignments.id, assignmentId),
        eq(reviewAssignments.caseId, locked.caseId),
        eq(reviewAssignments.organizationId, locked.organizationId),
      ),
    )
    .for("update");
  return row ? ({ ...locked, [assignmentLock]: true, assignmentId: row.id } as const) : null;
};

export type LockedReviewerAssignment = LockedApplicationCase & {
  readonly [assignmentLock]: true;
  readonly assignmentId: string;
};

const lockAssignmentResources = async (
  tx: Transaction,
  assignmentId: string,
  manager?: { slug: string; userId: string; caseId: string },
) => {
  const [target] = await tx
    .select({
      organizationId: reviewAssignments.organizationId,
      caseId: reviewAssignments.caseId,
      roundId: reviewRequests.criteriaRoundPublicId,
    })
    .from(reviewAssignments)
    .innerJoin(
      reviewRequests,
      and(
        eq(reviewRequests.caseId, reviewAssignments.caseId),
        eq(reviewRequests.id, reviewAssignments.requestId),
      ),
    )
    .where(eq(reviewAssignments.id, assignmentId));
  if (!target || (manager && manager.caseId !== target.caseId)) {
    return null;
  }
  const workspace = await lockWorkspaceRow(tx, manager ?? { id: target.organizationId }, "share");
  if (workspace?.organizationId !== target.organizationId) {
    return null;
  }
  const round = await lockFundingRound(workspace, target.roundId, "share");
  const locked = round && (await lockCaseRow(round, target.caseId));
  return locked && lockAssignmentRow(locked, assignmentId);
};

export const lockReviewerAssignment = async (
  tx: Transaction,
  assignmentId: string,
  userId: string,
) => {
  const locked = await lockAssignmentResources(tx, assignmentId);
  if (!locked) {
    return null;
  }
  const [user] = await locked.tx
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.active, true)))
    .for("share");
  const record = user && (await readReviewerRecord(locked.tx, locked.assignmentId));
  return record ? { locked: { ...locked, authorityLocked: true } as const, user, record } : null;
};

export const lockManagedReviewerAssignment = async (
  tx: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string; assignmentId: string },
) => {
  const locked = await lockAssignmentResources(tx, input.assignmentId, {
    slug: input.workspaceSlug,
    userId,
    caseId: input.publicId,
  });
  const access = locked && (await lockGrantActor(locked, userId));
  if (!access) {
    return null;
  }
  const record = await readReviewerRecord(access.tx, access.assignmentId);
  return record ? { record, actor: { ...access.actor, withdrawn: access.withdrawn } } : null;
};

export const reviewerReceipt = async (tx: Transaction, assignmentId: string, commandId: string) =>
  (
    await tx
      .select()
      .from(reviewerCommandReceipts)
      .where(
        and(
          eq(reviewerCommandReceipts.assignmentId, assignmentId),
          eq(reviewerCommandReceipts.commandId, commandId),
        ),
      )
  )[0];

const reviewerActions = {
  invite: "invited",
  resend: "invitation_renewed",
  accept: "accepted",
  decline: "declined",
  report_conflict: "conflict_reported",
  clear_conflict: "conflict_cleared",
  cancel: "access_ended",
  reinstate: "reinstated",
} as const;

export const recordReviewerEvent = async (
  tx: Transaction,
  input: {
    assignmentId: string;
    actor: Actor;
    name: string;
    action: keyof typeof reviewerActions;
    note?: string;
  },
) => {
  const record = await readReviewerRecord(tx, input.assignmentId);
  if (!record) {
    throw new Error("Reviewer assignment disappeared while recording its action");
  }
  await recordAuditEvent(tx, {
    organizationId: record.assignment.organizationId,
    actor: {
      userId: input.actor.userId,
      name: input.name,
      provenance: actorProvenance(input.actor),
    },
    action: `review_assignment.${input.action === "decline" && record.assignment.acceptedAt ? "withdrawn" : reviewerActions[input.action]}`,
    target: {
      type: "review_assignment",
      id: input.assignmentId,
      revision: record.assignment.revision,
      name: record.title,
    },
    context: {
      roundId: record.criteriaRoundId,
      applicationId: record.assignment.caseId,
      assignmentId: input.assignmentId,
    },
    details: {
      note: input.note ?? "",
      requestId: record.assignment.requestId,
      reviewer: record.reviewer,
      applicationVersion: record.applicationVersion,
      criteriaVersion: record.criteriaVersion,
    },
  });
};

export const recordReviewerReceipt = (
  tx: Transaction,
  input: { assignmentId: string; commandId: string; revision: number },
) =>
  tx.insert(reviewerCommandReceipts).values({
    assignmentId: input.assignmentId,
    commandId: input.commandId,
    resultRevision: input.revision,
  });

type ReviewerEmailQuota =
  | { kind: "invitation"; email: string }
  | { kind: "submission"; assignmentId: string };

const reviewerEmailLimited = async (
  tx: Transaction,
  organizationId: string,
  quota: ReviewerEmailQuota,
) => {
  const invitation = quota.kind === "invitation";
  const cooldown = invitation
    ? eq(reviewerMessages.recipient, quota.email)
    : eq(reviewerMessages.assignmentId, quota.assignmentId);
  const limits = invitation ? { hourly: 20, daily: 100 } : { hourly: 100, daily: 500 };
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`reviewer-${quota.kind}s:${organizationId}`}, 0))`,
  );
  const [counts] = await tx
    .select({
      recent: sql<number>`count(*) filter (where ${reviewerMessages.createdAt} > statement_timestamp() - interval '1 minute' and ${cooldown})::int`,
      hourly: sql<number>`count(*) filter (where ${reviewerMessages.createdAt} > statement_timestamp() - interval '1 hour')::int`,
      daily: sql<number>`count(*)::int`,
    })
    .from(reviewerMessages)
    .innerJoin(reviewAssignments, eq(reviewAssignments.id, reviewerMessages.assignmentId))
    .where(
      and(
        eq(reviewAssignments.organizationId, organizationId),
        eq(reviewerMessages.kind, quota.kind),
        sql`${reviewerMessages.createdAt} > statement_timestamp() - interval '24 hours'`,
      ),
    );
  return Boolean(
    counts && (counts.recent || counts.hourly >= limits.hourly || counts.daily >= limits.daily),
  );
};

/** The quota covers initial invitations and resends across every case in the workspace. */
export const queueReviewerInvitation = async (
  tx: Transaction,
  message: { organizationId: string; assignmentId: string; commandId: string; email: string },
  prepareAssignment: () => Promise<unknown>,
) => {
  if (
    await reviewerEmailLimited(tx, message.organizationId, {
      kind: "invitation",
      email: message.email,
    })
  ) {
    return false;
  }
  await prepareAssignment();
  await tx.insert(reviewerMessages).values({
    id: message.commandId,
    assignmentId: message.assignmentId,
    kind: "invitation",
    recipient: message.email,
    createdAt: sql`statement_timestamp()`,
  });
  return true;
};

export const queueSubmissionMessage = async (
  tx: Transaction,
  assignment: { id: string; organizationId: string; managerEmail: string },
  commandId: string,
) => {
  if (
    await reviewerEmailLimited(tx, assignment.organizationId, {
      kind: "submission",
      assignmentId: assignment.id,
    })
  ) {
    return;
  }
  await tx.insert(reviewerMessages).values({
    id: commandId,
    assignmentId: assignment.id,
    kind: "submission",
    recipient: assignment.managerEmail,
    createdAt: sql`statement_timestamp()`,
  });
};

export const finishReviewerMessage = (
  db: Database,
  id: string,
  deliveryToken: string,
  status: "sent" | "failed",
) =>
  db.execute(sql`select public.merit_finish_reviewer_message(${id}, ${deliveryToken}, ${status})`);

/**
 * A manager's retry puts the failed submission notice back to `pending` with a fresh delivery
 * token, in the command's transaction. The message keeps its ID, so the provider's idempotency
 * key is unchanged, and the workflow's outcome is guarded by the new token.
 */
export const resetFailedSubmissionMessage = async (tx: Transaction, assignmentId: string) => {
  const message = await latestReviewerMessage(tx, assignmentId, "submission");
  if (message?.status === "failed") {
    await tx.execute(sql`select public.merit_retry_reviewer_message(${message.id})`);
  }
};

export const updateReviewerAssignment = (
  tx: Transaction,
  id: string,
  changes: Partial<typeof reviewAssignments.$inferInsert>,
) => tx.update(reviewAssignments).set(changes).where(eq(reviewAssignments.id, id));

const writeDraftObservations = async (
  tx: Transaction,
  assignmentId: string,
  observations: ReviewerDraft["observations"],
) => {
  await tx
    .delete(reviewerDraftObservations)
    .where(eq(reviewerDraftObservations.assignmentId, assignmentId));
  if (observations.length > 0) {
    await tx.insert(reviewerDraftObservations).values(
      observations.map((obs, position) => ({
        assignmentId,
        position,
        criterionId: obs.criterionId,
        criterion: obs.criterion,
        text: obs.text,
      })),
    );
  }
};

export const writeReviewerDraft = async (
  { tx, assignmentId: id }: LockedReviewerAssignment,
  changes: {
    content: ReviewerDraft;
    revision: number;
    lastCommandId: string | null;
    updatedAt: Date;
  },
) => {
  await tx
    .update(reviewerDrafts)
    .set({
      position: changes.content.position,
      amount: changes.content.amount,
      reasoning: changes.content.reasoning,
      note: changes.content.note,
      revision: changes.revision,
      lastCommandId: changes.lastCommandId,
      updatedAt: changes.updatedAt,
    })
    .where(eq(reviewerDrafts.assignmentId, id));
  await writeDraftObservations(tx, id, changes.content.observations);
};

export const updateParticipatingRequest = async (
  tx: Transaction,
  caseId: string,
  requestId: string,
  status: "outstanding" | "received" | "cancelled",
  actor: Actor,
  name: string,
  cause?: "application_withdrawn",
) => {
  const closed = status !== "outstanding";
  const provenance = closed ? provenanceColumns(actorProvenance(actor)) : null;
  await tx
    .update(reviewRequests)
    .set({
      status,
      closedByUserId: closed ? actor.userId : null,
      closedByName: closed ? name : null,
      closedByRecordedAt: closed ? new Date() : null,
      closedByProvenanceInterface: provenance?.interfaceValue ?? null,
      closedByProvenanceClientId: provenance?.clientId ?? null,
      closedCause: closed ? (cause ?? null) : null,
    })
    .where(and(eq(reviewRequests.caseId, caseId), eq(reviewRequests.id, requestId)));
  await tx
    .insert(reviewStates)
    .values({ caseId, revision: 1 })
    .onConflictDoUpdate({
      target: reviewStates.caseId,
      set: { revision: sql`${reviewStates.revision} + 1` },
    });
};

export const createReviewerAssignment = async (
  tx: Transaction,
  values: typeof reviewAssignments.$inferInsert,
  draft: ReviewerDraft,
) => {
  await tx.insert(reviewAssignments).values(values);
  await tx.insert(reviewerDrafts).values({
    assignmentId: values.id,
    position: draft.position,
    amount: draft.amount,
    reasoning: draft.reasoning,
    note: draft.note,
  });
  if (draft.observations.length > 0) {
    await tx.insert(reviewerDraftObservations).values(
      draft.observations.map((obs, position) => ({
        assignmentId: values.id,
        position,
        criterionId: obs.criterionId,
        criterion: obs.criterion,
        text: obs.text,
      })),
    );
  }
};

export const assignmentForRequest = async (tx: Transaction, caseId: string, requestId: string) =>
  (
    await tx
      .select()
      .from(reviewAssignments)
      .where(and(eq(reviewAssignments.caseId, caseId), eq(reviewAssignments.requestId, requestId)))
  )[0];

export const cancelParticipatingRequest = async (
  tx: Transaction,
  caseId: string,
  requestId: string,
  actor: Actor,
  name: string,
) => {
  const assignment = await assignmentForRequest(tx, caseId, requestId);
  if (!assignment || assignment.status === "cancelled") {
    return;
  }
  await updateReviewerAssignment(tx, assignment.id, {
    status: "cancelled",
    revision: assignment.revision + 1,
  });
  await recordReviewerEvent(tx, {
    assignmentId: assignment.id,
    actor,
    name,
    action: "cancel",
  });
};

/**
 * Put a failed message back to `pending` with a fresh delivery token so its workflow delivers it
 * again, as the assistant's retry of its own invitation does. Only the newest message of its kind
 * in a workspace the member can access resets.
 */
export const resetFailedReviewerMessage = async (tx: Database, messageId: string) => {
  const [row] = (
    await tx.execute<{ reset: boolean }>(
      sql`select public.merit_retry_reviewer_message(${messageId}) as reset`,
    )
  ).rows;
  return row?.reset === true;
};
