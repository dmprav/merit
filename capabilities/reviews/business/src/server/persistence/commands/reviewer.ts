import { and, eq, sql, desc } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import { contacts } from "@merit/contacts/schema";
import type { Database } from "@merit/db";
import { organizations } from "@merit/organizations/schema";
import { fundingRounds } from "@merit/rounds/schema";

import { readReviewerRecord } from "../reviewer-records";
import {
  reviewerDrafts,
  reviewAssignments,
  reviewerCommandReceipts,
  reviewerMessages,
} from "../reviewer-schema";
import { reviewRequests, reviewStates } from "../schema";

export type ReviewerTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Match grant command lock order so cancellation, submissions, and material edits serialize. */
export const lockReviewerAssignment = async (tx: ReviewerTransaction, id: string) => {
  const initial = await readReviewerRecord(tx, id);
  if (!initial) {
    return undefined;
  }
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, initial.assignment.organizationId))
    .for("share");
  await tx
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .where(eq(fundingRounds.id, initial.criteriaRoundId!))
    .for("share");
  await tx
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .where(eq(applicationCases.id, initial.assignment.caseId))
    .for("update");
  await tx
    .select({ id: reviewAssignments.id })
    .from(reviewAssignments)
    .where(eq(reviewAssignments.id, id))
    .for("update");
  return readReviewerRecord(tx, id);
};

export const reviewerReceipt = async (tx: Database, assignmentId: string, commandId: string) =>
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
  tx: ReviewerTransaction,
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
  tx: Database,
  input: { assignmentId: string; commandId: string; revision: number },
) =>
  tx.insert(reviewerCommandReceipts).values({
    assignmentId: input.assignmentId,
    commandId: input.commandId,
    resultRevision: input.revision,
  });

export const reviewContact = async (tx: Database, organizationId: string, contactId: string) =>
  (
    await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId)))
  )[0];

export const invitationLimited = async (tx: Database, organizationId: string, email: string) => {
  const [counts] = await tx
    .select({
      recent: sql<number>`count(*) filter (where ${reviewerMessages.createdAt} > now() - interval '1 minute' and ${reviewerMessages.recipient} = ${email})::int`,
      hourly: sql<number>`count(*) filter (where ${reviewerMessages.createdAt} > now() - interval '1 hour')::int`,
      daily: sql<number>`count(*)::int`,
    })
    .from(reviewerMessages)
    .innerJoin(reviewAssignments, eq(reviewAssignments.id, reviewerMessages.assignmentId))
    .where(
      and(
        eq(reviewAssignments.organizationId, organizationId),
        eq(reviewerMessages.kind, "invitation"),
        sql`${reviewerMessages.createdAt} > now() - interval '24 hours'`,
      ),
    );
  return Boolean(counts && (counts.recent || counts.hourly >= 20 || counts.daily >= 100));
};

export const queueReviewerMessage = async (
  tx: Database,
  assignmentId: string,
  id: string,
  kind: "invitation" | "submission",
  recipient: string,
) => {
  await tx.insert(reviewerMessages).values({ id, assignmentId, kind, recipient });
};

export const pendingReviewerMessages = (db: Database, assignmentId: string) =>
  db
    .select()
    .from(reviewerMessages)
    .where(eq(reviewerMessages.assignmentId, assignmentId))
    .orderBy(desc(reviewerMessages.createdAt), desc(reviewerMessages.id));

export const finishReviewerMessage = (db: Database, id: string, status: "sent" | "failed") =>
  db.update(reviewerMessages).set({ status }).where(eq(reviewerMessages.id, id));

export const updateReviewerAssignment = (
  tx: Database,
  id: string,
  changes: Partial<typeof reviewAssignments.$inferInsert>,
) => tx.update(reviewAssignments).set(changes).where(eq(reviewAssignments.id, id));

export const writeReviewerDraft = (
  tx: Database,
  id: string,
  changes: Partial<typeof reviewerDrafts.$inferInsert>,
) => tx.update(reviewerDrafts).set(changes).where(eq(reviewerDrafts.assignmentId, id));

export const updateParticipatingRequest = async (
  tx: Database,
  caseId: string,
  requestId: string,
  status: "outstanding" | "received" | "cancelled",
  actor: Actor,
  name: string,
) => {
  await tx
    .update(reviewRequests)
    .set({
      status,
      closedBy:
        status === "outstanding"
          ? null
          : {
              userId: actor.userId,
              name,
              provenance: actorProvenance(actor),
              recordedAt: new Date().toISOString(),
            },
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
  tx: Database,
  values: typeof reviewAssignments.$inferInsert,
  draft: (typeof reviewerDrafts.$inferInsert)["content"],
) => {
  await tx.insert(reviewAssignments).values(values);
  await tx.insert(reviewerDrafts).values({ assignmentId: values.id, content: draft });
};

export const assignmentForRequest = async (tx: Database, caseId: string, requestId: string) =>
  (
    await tx
      .select()
      .from(reviewAssignments)
      .where(and(eq(reviewAssignments.caseId, caseId), eq(reviewAssignments.requestId, requestId)))
  )[0];

export const cancelParticipatingRequest = async (
  tx: ReviewerTransaction,
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
