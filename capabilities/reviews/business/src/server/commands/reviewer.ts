import { lockApplicationCase, readCaseWithdrawn } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import { readContact } from "@merit/contacts/scope";
import type { Database } from "@merit/db";

import {
  inviteReviewerSchema,
  manageReviewerSchema,
  reviewerActionSchema,
  saveReviewerDraftSchema,
  submitReviewerSchema,
  type ReviewerService,
} from "../../api/reviewer";
import {
  emptyReviewerDraft,
  isInvitationExpired,
  nextReviewerStatus,
  reviewerSubmission,
} from "../../domain/reviewer";
import { prepareReviewChange } from "../../domain/reviews";
import {
  lockManagedReviewerAssignment,
  lockReviewerAssignment,
  reviewerReceipt,
  recordReviewerEvent,
  recordReviewerReceipt,
  invitationLimited,
  queueReviewerMessage,
  updateReviewerAssignment,
  writeReviewerDraft,
  updateParticipatingRequest,
  createReviewerAssignment,
  assignmentForRequest,
  type ReviewerTransaction,
} from "../persistence/commands/reviewer";
import {
  readReviewState,
  readReviewCriteria,
  readMaterialVersions,
  recordReviewChange,
} from "../persistence/commands/reviews";
import {
  lockActiveReviewer,
  reviewerIdentityCurrent,
  reviewerOwns,
  permittedReviewerWork,
  readPrivateReviewerDraft,
  reviewerMembership,
  reviewerMembershipByEmail,
  type ReviewerRecord,
} from "../persistence/reviewer-records";

const expires = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

export const inviteReviewer = async (
  db: Database,
  actor: Actor,
  emails: string[],
  input: Parameters<ReviewerService["invite"]>[1],
) => {
  const parsed = inviteReviewerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" } as const;
  }
  const request = parsed.data;
  return db.transaction(async (tx) => {
    const access = await lockApplicationCase(tx, actor.userId, request, "share", "update");
    if (!access || access.organizationKind !== "standard") {
      return { status: "not_found" } as const;
    }
    const existing = await assignmentForRequest(tx, request.publicId, request.requestId);
    if (existing) {
      return existing.id === request.commandId && existing.dueDate === request.dueDate
        ? ({ status: "ok", id: existing.id } as const)
        : ({ status: "invalid" } as const);
    }
    if (access.withdrawn) {
      return { status: "invalid", error: "application_withdrawn" } as const;
    }
    const row = await readReviewState(tx, access.organizationId, request.publicId);
    const review = row?.reviews.requests.find((value) => value.id === request.requestId);
    if (
      !review ||
      review.status !== "outstanding" ||
      !review.applicationVersion ||
      !review.criteriaVersion
    ) {
      return { status: "invalid" } as const;
    }
    const contact = await readContact(tx, access.organizationId, review.contactId);
    const email = contact?.email.trim().toLowerCase();
    const managerEmail = emails[0]?.toLowerCase();
    if (!contact || contact.archived || !email || !managerEmail || !email.includes("@")) {
      return { status: "invalid" } as const;
    }
    const membershipId = await reviewerMembershipByEmail(tx, access.organizationId, email);
    if (!membershipId) {
      return { status: "invalid", error: "workspace_membership_required" } as const;
    }
    if (await invitationLimited(tx, access.organizationId, email)) {
      return { status: "limited" } as const;
    }
    const id = request.commandId;
    await createReviewerAssignment(
      tx,
      {
        id,
        caseId: request.publicId,
        organizationId: access.organizationId,
        requestId: request.requestId,
        email,
        membershipId,
        managerUserId: actor.userId,
        managerName: access.actor.name ?? managerEmail,
        managerEmail,
        dueDate: request.dueDate,
        expiresAt: expires(),
      },
      emptyReviewerDraft(),
    );
    await recordReviewerReceipt(tx, { assignmentId: id, commandId: id, revision: 0 });
    await recordReviewerEvent(tx, {
      assignmentId: id,
      actor,
      name: access.actor.name ?? managerEmail,
      action: "invite",
    });
    await queueReviewerMessage(tx, id, request.commandId, "invitation", email);
    return { status: "ok", id } as const;
  });
};

export const manageReviewer = async (
  db: Database,
  actor: Actor,
  input: Parameters<ReviewerService["manage"]>[1],
) => {
  const parsed = manageReviewerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" } as const;
  }
  const request = parsed.data;
  return db.transaction(async (tx) => {
    const locked = await lockManagedReviewerAssignment(
      tx,
      actor.userId,
      request,
      request.action === "resend" ? "update" : "share",
    );
    if (!locked) {
      return { status: "not_found" } as const;
    }
    const { record, actor: manager } = locked;
    if (await reviewerReceipt(tx, request.assignmentId, request.commandId)) {
      return { status: "ok", id: request.assignmentId } as const;
    }
    if (manager.withdrawn) {
      return { status: "invalid", error: "application_withdrawn" } as const;
    }
    const assignment = record.assignment;
    if (assignment.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }
    const managerName = manager.name ?? assignment.managerName;
    const revision =
      request.action === "retry_notification" ? assignment.revision : assignment.revision + 1;
    const changed = await applyManagerAction(tx, assignment, actor, managerName, request);
    if (changed.status !== "ok") {
      return changed;
    }
    await recordReviewerReceipt(tx, { ...request, revision });
    if (request.action !== "retry_notification") {
      await recordReviewerEvent(tx, {
        assignmentId: assignment.id,
        actor,
        name: managerName,
        action: request.action,
        note: request.note,
      });
    }
    return { status: "ok", id: assignment.id } as const;
  });
};

export const respondToReview = async (
  db: Database,
  actor: Actor,
  emails: string[],
  input: Parameters<ReviewerService["respond"]>[1],
) => {
  const parsed = reviewerActionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" } as const;
  }
  const request = parsed.data;
  return db.transaction(async (tx) => {
    const record = await lockReviewerAssignment(tx, request.assignmentId);
    const user = await lockActiveReviewer(tx, actor.userId);
    if (
      !record ||
      !user ||
      !reviewerOwns(record, actor.userId, emails) ||
      !(await reviewerIdentityCurrent(tx, request.assignmentId))
    ) {
      return { status: "not_found" } as const;
    }
    if (await reviewerReceipt(tx, request.assignmentId, request.commandId)) {
      return { status: "ok", id: request.assignmentId } as const;
    }
    if (await readCaseWithdrawn(tx, record.assignment.caseId)) {
      return { status: "invalid", error: "application_withdrawn" } as const;
    }
    const assignment = record.assignment;
    if (assignment.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }
    if (isInvitationExpired(assignment)) {
      return { status: "expired" } as const;
    }
    const status = nextReviewerStatus(
      {
        status: assignment.status,
        accepted: assignment.acceptedAt !== null,
        submitted: assignment.assessmentId !== null,
        conflict: assignment.conflict,
      },
      request.action,
      request.note,
    );
    if (!status) {
      return { status: "invalid" } as const;
    }
    const membershipId = await reviewerMembership(tx, assignment.organizationId, user.id);
    if (request.action === "accept" && !membershipId) {
      return { status: "invalid", error: "workspace_membership_required" } as const;
    }
    const revision = assignment.revision + 1;
    await updateReviewerAssignment(tx, assignment.id, {
      status,
      revision,
      reviewerUserId: user.id,
      ...(assignment.reviewerUserId === null || assignment.membershipId === null
        ? { membershipId }
        : {}),
      ...(request.action === "accept" ? { acceptedAt: new Date() } : {}),
      ...(request.action === "report_conflict" ? { conflict: request.note } : {}),
    });
    const name = user.name ?? record.reviewer;
    if (status === "declined") {
      const { caseId, requestId } = assignment;
      await updateParticipatingRequest(tx, caseId, requestId, "cancelled", actor, name);
    }
    await recordReviewerReceipt(tx, { ...request, revision });
    await recordReviewerEvent(tx, {
      assignmentId: assignment.id,
      actor,
      name,
      action: request.action,
      note: request.note,
    });
    return { status: "ok", id: assignment.id } as const;
  });
};

export const saveReviewerDraft = async (
  db: Database,
  actor: Actor,
  input: Parameters<ReviewerService["saveDraft"]>[1],
): ReturnType<ReviewerService["saveDraft"]> => {
  const parsed = saveReviewerDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }
  const request = parsed.data;
  return db.transaction(async (tx) => {
    const record = await lockReviewerAssignment(tx, request.assignmentId);
    if (
      !record ||
      !(await lockActiveReviewer(tx, actor.userId)) ||
      !(await permittedReviewerWork(tx, request.assignmentId, actor.userId))
    ) {
      return { status: "not_found" };
    }
    if (await readCaseWithdrawn(tx, record.assignment.caseId)) {
      return { status: "invalid", error: "application_withdrawn" };
    }
    const draft = await readPrivateReviewerDraft(tx, request.assignmentId);
    if (!draft) {
      return { status: "not_found" };
    }
    if (draft.lastCommandId === request.commandId) {
      return { status: "ok", value: { revision: draft.revision } };
    }
    if (draft.revision !== request.expectedDraftRevision) {
      return { status: "conflict" };
    }
    const revision = draft.revision + 1;
    await writeReviewerDraft(tx, request.assignmentId, {
      content: request.draft,
      revision,
      lastCommandId: request.commandId,
      updatedAt: new Date(),
    });
    return { status: "ok", value: { revision } };
  });
};

export const submitReviewerAssessment = async (
  db: Database,
  actor: Actor,
  input: Parameters<ReviewerService["submit"]>[1],
): ReturnType<ReviewerService["submit"]> => {
  const parsed = submitReviewerSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }
  const request = parsed.data;
  return db.transaction(async (tx) => {
    const record = await lockReviewerAssignment(tx, request.assignmentId);
    const user = await lockActiveReviewer(tx, actor.userId);
    if (
      !record ||
      !user ||
      !(await permittedReviewerWork(tx, request.assignmentId, actor.userId))
    ) {
      return { status: "not_found" };
    }
    const receipt = await reviewerReceipt(tx, request.assignmentId, request.commandId);
    if (receipt) {
      return { status: "ok", value: { revision: receipt.resultRevision } };
    }
    if (await readCaseWithdrawn(tx, record.assignment.caseId)) {
      return { status: "invalid", error: "application_withdrawn" };
    }
    const assignment = record.assignment;
    const draft = await readPrivateReviewerDraft(tx, assignment.id);
    if (!draft || draft.revision !== request.expectedDraftRevision) {
      return { status: "conflict" };
    }
    const content = reviewerSubmission(
      draft.content,
      { applicationVersion: record.applicationVersion!, criteriaVersion: record.criteriaVersion! },
      assignment.assessmentId !== null,
    );
    if (!content) {
      return { status: "invalid" };
    }
    const row = await readReviewState(tx, assignment.organizationId, assignment.caseId);
    const round = await readReviewCriteria(tx, assignment.organizationId, record.criteriaRoundId);
    if (!row || !round) {
      return { status: "not_found" };
    }
    const contactId = row.reviews.requests.find(
      (value) => value.id === assignment.requestId,
    )?.contactId;
    if (!contactId) {
      return { status: "not_found" };
    }
    const recorder = {
      userId: actor.userId,
      name: user.name ?? record.reviewer,
      recordedAt: new Date().toISOString(),
      provenance: actorProvenance(actor),
    };
    const recorded = await recordOwnAssessment(
      tx,
      record,
      row,
      round,
      contactId,
      content,
      recorder,
      draft.content.note,
    );
    if (recorded.status !== "ok") {
      return recorded;
    }
    return completeReviewerSubmission(tx, {
      assignment,
      draft,
      content,
      commandId: request.commandId,
    });
  });
};

const resumptionProblem = async (
  tx: ReviewerTransaction,
  assignment: ReviewerRecord["assignment"],
  status: string,
) => {
  // A follow-up request may already occupy this contact's outstanding work.
  const state = await readReviewState(tx, assignment.organizationId, assignment.caseId);
  const contactId = state?.reviews.requests.find(
    (item) => item.id === assignment.requestId,
  )?.contactId;
  if (
    status !== "cancelled" &&
    contactId &&
    (await readContact(tx, assignment.organizationId, contactId))?.archived
  ) {
    return "invalid" as const;
  }
  if (
    !assignment.assessmentId &&
    status !== "cancelled" &&
    state?.reviews.requests.some(
      (value) =>
        value.id !== assignment.requestId &&
        value.contactId === contactId &&
        value.status === "outstanding",
    )
  ) {
    return "conflict" as const;
  }
  return null;
};

const changeReviewerParticipation = async (
  tx: ReviewerTransaction,
  assignment: ReviewerRecord["assignment"],
  actor: Actor,
  name: string,
  request: Parameters<ReviewerService["manage"]>[1],
) => {
  if (request.action === "resend" || request.action === "retry_notification") {
    return { status: "invalid" } as const;
  }
  const revision = assignment.revision + 1;
  const status = nextReviewerStatus(
    {
      status: assignment.status,
      accepted: assignment.acceptedAt !== null,
      submitted: assignment.assessmentId !== null,
      conflict: assignment.conflict,
    },
    request.action,
    request.note,
  );
  if (!status) {
    return { status: "invalid" } as const;
  }
  const problem = await resumptionProblem(tx, assignment, status);
  if (problem) {
    return { status: problem } as const;
  }
  const membershipId =
    request.action === "reinstate"
      ? assignment.reviewerUserId
        ? await reviewerMembership(tx, assignment.organizationId, assignment.reviewerUserId)
        : await reviewerMembershipByEmail(tx, assignment.organizationId, assignment.email)
      : assignment.membershipId;
  if (request.action === "reinstate" && !membershipId) {
    return { status: "invalid", error: "workspace_membership_required" } as const;
  }
  await updateReviewerAssignment(tx, assignment.id, {
    status,
    revision,
    ...(request.action === "reinstate" ? { membershipId } : {}),
    ...(request.action === "clear_conflict" ? { conflict: "", expiresAt: expires() } : {}),
    ...(status === "invited" ? { expiresAt: expires() } : {}),
  });
  await updateParticipatingRequest(
    tx,
    assignment.caseId,
    assignment.requestId,
    assignment.assessmentId ? "received" : status === "cancelled" ? "cancelled" : "outstanding",
    actor,
    name,
  );
  return { status: "ok" } as const;
};

const recordOwnAssessment = async (
  tx: ReviewerTransaction,
  record: ReviewerRecord,
  row: NonNullable<Awaited<ReturnType<typeof readReviewState>>>,
  round: NonNullable<Awaited<ReturnType<typeof readReviewCriteria>>>,
  contactId: string,
  content: NonNullable<ReturnType<typeof reviewerSubmission>>,
  recorder: {
    userId: string;
    name: string;
    recordedAt: string;
    provenance: ReturnType<typeof actorProvenance>;
  },
  note: string,
) => {
  const assignment = record.assignment;
  const assessmentId = assignment.assessmentId ?? assignment.id;
  const result = prepareReviewChange(
    row.reviews,
    assignment.assessmentId
      ? {
          action: "edit",
          id: assignment.assessmentId,
          content,
          note: note.trim(),
        }
      : {
          action: "record",
          id: assignment.id,
          contactId,
          requestId: assignment.requestId,
          previousId:
            row.reviews.assessments.filter((value) => value.contactId === contactId).at(-1)?.id ??
            null,
          content,
        },
    {
      contact: { id: contactId, name: record.reviewer, archived: false },
      applicationVersion: row.applicationVersion,
      availableVersions: await readMaterialVersions(tx, assignment.caseId),
      criteriaVersion: round.criteriaVersion,
      criteriaHistory: round.criteriaHistory,
      recorder,
      authorUserId: recorder.userId,
    },
  );
  if (!result.ok) {
    return {
      status: result.error === "reviewer_authored" ? "forbidden" : "invalid",
    } as const;
  }
  const version =
    result.state.assessments.find((value) => value.id === assessmentId)?.versions.length ?? 1;
  await recordReviewChange(tx, row, result.state);
  await recordSubmissionEvent(tx, {
    record,
    recorder,
    content,
    note,
    recorded: { assessmentId, version },
  });
  return {
    status: "ok",
    assessmentId,
    version,
  } as const;
};

const applyManagerAction = async (
  tx: ReviewerTransaction,
  assignment: ReviewerRecord["assignment"],
  actor: Actor,
  name: string,
  request: Parameters<ReviewerService["manage"]>[1],
) => {
  const revision = assignment.revision + 1;
  if (request.action === "resend") {
    if (assignment.status !== "invited") {
      return { status: "invalid" } as const;
    }
    if (await invitationLimited(tx, assignment.organizationId, assignment.email)) {
      return { status: "limited" } as const;
    }
    await updateReviewerAssignment(tx, assignment.id, { expiresAt: expires(), revision });
    await queueReviewerMessage(
      tx,
      assignment.id,
      request.commandId,
      "invitation",
      assignment.email,
    );
  } else if (request.action === "retry_notification") {
    if (!assignment.assessmentId) {
      return { status: "invalid" } as const;
    }
  } else {
    const changed = await changeReviewerParticipation(tx, assignment, actor, name, request);
    if (changed.status !== "ok") {
      return changed;
    }
  }
  return { status: "ok" } as const;
};

const completeReviewerSubmission = async (
  tx: ReviewerTransaction,
  {
    assignment,
    draft,
    content,
    commandId,
  }: {
    assignment: ReviewerRecord["assignment"];
    draft: NonNullable<Awaited<ReturnType<typeof readPrivateReviewerDraft>>>;
    content: NonNullable<ReturnType<typeof reviewerSubmission>>;
    commandId: string;
  },
): ReturnType<ReviewerService["submit"]> => {
  const revision = draft.revision + 1;
  await writeReviewerDraft(tx, assignment.id, {
    revision,
    content: { ...draft.content, reasoning: content.reasoning, note: "" },
    lastCommandId: null,
    updatedAt: new Date(),
  });
  await updateReviewerAssignment(tx, assignment.id, {
    status: "submitted",
    assessmentId: assignment.assessmentId ?? assignment.id,
    revision: assignment.revision + 1,
  });
  await recordReviewerReceipt(tx, { assignmentId: assignment.id, commandId, revision });
  await queueReviewerMessage(tx, assignment.id, commandId, "submission", assignment.managerEmail);
  return { status: "ok", value: { revision } };
};

const recordSubmissionEvent = async (
  tx: ReviewerTransaction,
  {
    record,
    recorded,
    recorder,
    content,
    note,
  }: {
    record: ReviewerRecord;
    recorded: { assessmentId: string; version: number };
    recorder: { userId: string; name: string; provenance: ReturnType<typeof actorProvenance> };
    content: NonNullable<ReturnType<typeof reviewerSubmission>>;
    note: string;
  },
) => {
  await recordAuditEvent(tx, {
    organizationId: record.assignment.organizationId,
    actor: { userId: recorder.userId, name: recorder.name, provenance: recorder.provenance },
    action: record.assignment.assessmentId ? "assessment.amended" : "assessment.submitted",
    target: {
      type: "assessment",
      id: recorded.assessmentId,
      revision: recorded.version,
      name: record.title,
    },
    context: {
      roundId: record.criteriaRoundId,
      applicationId: record.assignment.caseId,
      assignmentId: record.assignment.id,
    },
    details: {
      note: note.trim(),
      requestId: record.assignment.requestId,
      authorUserId: recorder.userId,
      applicationVersion: content.applicationVersion,
      criteriaVersion: content.criteriaVersion,
    },
  });
};
