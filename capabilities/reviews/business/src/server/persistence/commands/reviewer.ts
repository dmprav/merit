import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { caseWithdrawn } from "@merit/applications/scope";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import { lockGrantActor } from "@merit/organizations/locks";
import { organizations } from "@merit/organizations/schema";
import { authorizedWorkspaces } from "@merit/organizations/scope";
import { fundingRounds } from "@merit/rounds/schema";

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

/**
 * Canonical grant-work lock hierarchy:
 * organizations -> funding_rounds -> application_cases -> review_assignments -> memberships / app_users.
 * Match grant command lock order so cancellation, submissions, and material edits serialize.
 */
export const lockReviewerAssignment = async (tx: Transaction, id: string) => {
  const [target] = await tx
    .select({
      organizationId: reviewAssignments.organizationId,
      caseId: reviewAssignments.caseId,
      roundId: reviewRequests.criteriaRoundPublicId,
    })
    .from(reviewAssignments)
    .innerJoin(applicationCases, eq(applicationCases.id, reviewAssignments.caseId))
    .innerJoin(
      reviewRequests,
      and(
        eq(reviewRequests.caseId, reviewAssignments.caseId),
        eq(reviewRequests.id, reviewAssignments.requestId),
      ),
    )
    .where(eq(reviewAssignments.id, id));
  if (!target) {
    return undefined;
  }
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, target.organizationId))
    .for("share");
  await tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .where(
      and(
        eq(fundingRounds.organizationId, target.organizationId),
        eq(fundingRounds.id, target.roundId),
      ),
    )
    .for("share");
  await tx
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .where(eq(applicationCases.id, target.caseId))
    .for("update");
  await tx
    .select({ id: reviewAssignments.id })
    .from(reviewAssignments)
    .where(eq(reviewAssignments.id, id))
    .for("update");
  return readReviewerRecord(tx, id);
};

const lockManagedAssignmentRound = async (
  tx: Transaction,
  workspaceId: string,
  input: { publicId: string; assignmentId: string },
) => {
  const [target] = await tx
    .select({
      roundId: reviewRequests.criteriaRoundPublicId,
    })
    .from(reviewAssignments)
    .innerJoin(applicationCases, eq(applicationCases.id, reviewAssignments.caseId))
    .innerJoin(
      reviewRequests,
      and(
        eq(reviewRequests.caseId, reviewAssignments.caseId),
        eq(reviewRequests.id, reviewAssignments.requestId),
      ),
    )
    .where(
      and(
        eq(reviewAssignments.id, input.assignmentId),
        eq(reviewAssignments.caseId, input.publicId),
        eq(reviewAssignments.organizationId, workspaceId),
      ),
    );
  if (!target) {
    return false;
  }
  await tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, workspaceId), eq(fundingRounds.id, target.roundId)))
    .for("share");
  return true;
};

const lockManagedCaseAndActor = async (
  tx: Transaction,
  userId: string,
  workspaceId: string,
  input: { publicId: string; assignmentId: string },
) => {
  const access = authorizedWorkspaces(tx, userId, "work_on_grants");
  const [lockedCase] = await tx
    .select({ id: applicationCases.id, withdrawn: caseWithdrawn })
    .from(applicationCases)
    .innerJoin(access, eq(access.id, applicationCases.organizationId))
    .where(
      and(
        eq(applicationCases.id, input.publicId),
        eq(applicationCases.organizationId, workspaceId),
      ),
    )
    .for("update", { of: applicationCases });
  if (!lockedCase) {
    return null;
  }
  const [lockedAssignment] = await tx
    .select({ id: reviewAssignments.id })
    .from(reviewAssignments)
    .where(
      and(
        eq(reviewAssignments.id, input.assignmentId),
        eq(reviewAssignments.caseId, input.publicId),
        eq(reviewAssignments.organizationId, workspaceId),
      ),
    )
    .for("update");
  if (!lockedAssignment) {
    return null;
  }
  const actor = await lockGrantActor(tx, userId, workspaceId);
  return actor ? { ...actor, withdrawn: lockedCase.withdrawn } : null;
};

/**
 * Lock organization -> funding_rounds -> application_cases -> review_assignments -> memberships/app_users
 * in one pass for manager actions on a reviewer assignment.
 */
export const lockManagedReviewerAssignment = async (
  tx: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string; assignmentId: string },
) => {
  const [workspace] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.workspaceSlug))
    .for("share");
  if (!workspace || !(await lockManagedAssignmentRound(tx, workspace.id, input))) {
    return null;
  }
  const actor = await lockManagedCaseAndActor(tx, userId, workspace.id, input);
  if (!actor) {
    return null;
  }
  const record = await readReviewerRecord(tx, input.assignmentId);
  return record ? { record, actor } : null;
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
  tx: Transaction,
  id: string,
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
