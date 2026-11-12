import { lockApplicationCase } from "@merit/applications/locks";
import type { Actor } from "@merit/auth";
import { actorProvenance } from "@merit/auth";
import type { Database } from "@merit/db";
import { lockGrantWorkspace } from "@merit/organizations/locks";

import {
  inviteReviewerSchema,
  manageReviewerSchema,
  reviewerActionSchema,
  saveReviewerDraftSchema,
  submitReviewerSchema,
  type ReviewerService,
} from "../../api/reviewer";
import { emptyReviewerDraft, nextReviewerStatus, reviewerSubmission } from "../../domain/reviewer";
import { prepareReviewChange } from "../../domain/reviews";
import {
  lockReviewerAssignment,
  reviewerReceipt,
  recordReviewerEvent,
  reviewContact,
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
  activeReviewer,
  reviewerIdentityCurrent,
  reviewerOwns,
  permittedReviewerWork,
  readPrivateReviewerDraft,
  reviewerMembership,
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
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "update");
    if (
      !access ||
      access.organization.kind !== "standard" ||
      !(await lockApplicationCase(tx, actor.userId, request))
    ) {
      return { status: "not_found" } as const;
    }
    const existing = await assignmentForRequest(tx, request.publicId, request.requestId);
    if (existing) {
      return { status: "ok", id: existing.id } as const;
    }
    const row = await readReviewState(tx, access.organization.id, request.publicId);
    const review = row?.reviews.requests.find((value) => value.id === request.requestId);
    if (
      !review ||
      review.status !== "outstanding" ||
      !review.applicationVersion ||
      !review.criteriaVersion
    ) {
      return { status: "invalid" } as const;
    }
    const contact = await reviewContact(tx, access.organization.id, review.contactId);
    const email = contact?.email.trim().toLowerCase();
    const managerEmail = emails[0]?.toLowerCase();
    if (!contact || contact.archived || !email || !managerEmail || !email.includes("@")) {
      return { status: "invalid" } as const;
    }
    if (await invitationLimited(tx, access.organization.id, email)) {
      return { status: "limited" } as const;
    }
    const id = request.commandId;
    await createReviewerAssignment(
      tx,
      {
        id,
        caseId: request.publicId,
        organizationId: access.organization.id,
        requestId: request.requestId,
        email,
        managerUserId: actor.userId,
        managerName: access.actor.name ?? managerEmail,
        managerEmail,
        dueDate: request.dueDate,
        expiresAt: expires(),
      },
      emptyReviewerDraft(),
    );
    await recordReviewerEvent(tx, {
      assignmentId: id,
      commandId: request.commandId,
      actor,
      name: access.actor.name ?? managerEmail,
      action: "invite",
      revision: 0,
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
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "update");
    if (!access || !(await lockApplicationCase(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    const record = await lockReviewerAssignment(tx, request.assignmentId);
    if (
      !record ||
      record.assignment.caseId !== request.publicId ||
      record.assignment.organizationId !== access.organization.id
    ) {
      return { status: "not_found" } as const;
    }
    if (await reviewerReceipt(tx, request.assignmentId, request.commandId)) {
      return { status: "ok", id: request.assignmentId } as const;
    }
    const assignment = record.assignment;
    if (assignment.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }
    const revision = assignment.revision + 1;
    const changed = await applyManagerAction(
      tx,
      assignment,
      actor,
      access.actor.name ?? assignment.managerName,
      request,
    );
    if (changed.status !== "ok") {
      return changed;
    }
    await recordReviewerEvent(tx, {
      assignmentId: assignment.id,
      commandId: request.commandId,
      actor,
      name: access.actor.name ?? assignment.managerName,
      action: request.action,
      note: request.note,
      revision,
    });
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
    const user = await activeReviewer(tx, actor.userId, true);
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
    const assignment = record.assignment;
    if (assignment.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }
    if (assignment.status === "invited" && assignment.expiresAt <= new Date()) {
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
    const revision = assignment.revision + 1;
    await updateReviewerAssignment(tx, assignment.id, {
      status,
      revision,
      reviewerUserId: user.id,
      ...(assignment.reviewerUserId === null
        ? { membershipId: await reviewerMembership(tx, assignment.organizationId, user.id) }
        : {}),
      ...(request.action === "accept" ? { acceptedAt: new Date() } : {}),
      ...(request.action === "report_conflict" ? { conflict: request.note } : {}),
    });
    if (status === "declined") {
      await updateParticipatingRequest(
        tx,
        assignment.caseId,
        assignment.requestId,
        "cancelled",
        actor,
        user.name ?? record.reviewer,
      );
    }
    await recordReviewerEvent(tx, {
      assignmentId: assignment.id,
      commandId: request.commandId,
      actor,
      name: user.name ?? record.reviewer,
      action: request.action,
      note: request.note,
      revision,
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
      !(await activeReviewer(tx, actor.userId, true)) ||
      !(await permittedReviewerWork(tx, request.assignmentId, actor.userId))
    ) {
      return { status: "not_found" };
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
    const user = await activeReviewer(tx, actor.userId, true);
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
      actor,
      name: recorder.name,
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
    (await reviewContact(tx, assignment.organizationId, contactId))?.archived
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
  await updateReviewerAssignment(tx, assignment.id, {
    status,
    revision,
    ...(request.action === "reinstate" && assignment.reviewerUserId
      ? {
          membershipId: await reviewerMembership(
            tx,
            assignment.organizationId,
            assignment.reviewerUserId,
          ),
        }
      : {}),
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
  let next = structuredClone(row.reviews);
  if (assignment.assessmentId) {
    const assessment = next.assessments.find((value) => value.id === assignment.assessmentId);
    if (!assessment || assessment.authorUserId !== recorder.userId) {
      return { status: "forbidden" } as const;
    }
    assessment.versions.push({
      content,
      criteria: round.criteriaHistory.find((value) => value.version === record.criteriaVersion)!
        .criteria,
      recorder,
      note: note.trim(),
    });
    next.revision++;
  } else {
    const result = prepareReviewChange(
      next,
      {
        action: "record",
        id: assignment.id,
        contactId,
        requestId: assignment.requestId,
        previousId:
          next.assessments.filter((value) => value.contactId === contactId).at(-1)?.id ?? null,
        content,
      },
      {
        contact: { id: contactId, name: record.reviewer, archived: false },
        applicationVersion: row.applicationVersion,
        availableVersions: await readMaterialVersions(tx, assignment.caseId),
        criteriaVersion: round.criteriaVersion,
        criteriaHistory: round.criteriaHistory,
        recorder,
      },
    );
    if (!result.ok) {
      return { status: "invalid" } as const;
    }
    next = result.state;
    next.assessments.find((value) => value.id === assignment.id)!.authorUserId = recorder.userId;
  }
  await recordReviewChange(tx, row, next);
  return { status: "ok" } as const;
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
    await updateReviewerAssignment(tx, assignment.id, { revision });
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
    actor,
    name,
    commandId,
  }: {
    assignment: ReviewerRecord["assignment"];
    draft: NonNullable<Awaited<ReturnType<typeof readPrivateReviewerDraft>>>;
    content: NonNullable<ReturnType<typeof reviewerSubmission>>;
    actor: Actor;
    name: string;
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
  await recordReviewerEvent(tx, {
    assignmentId: assignment.id,
    commandId: commandId,
    actor,
    name,
    action: assignment.assessmentId ? "amend" : "submit",
    note: draft.content.note.trim(),
    revision,
  });
  await queueReviewerMessage(tx, assignment.id, commandId, "submission", assignment.managerEmail);
  return { status: "ok", value: { revision } };
};
