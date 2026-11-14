import { lockApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import { readContact } from "@merit/contacts/scope";
import type { Database } from "@merit/db";

import { saveReviewRequestSchema, type SaveReviewRequest } from "../../api/commands/reviews";
import { prepareReviewChange, type ReviewState } from "../../domain/reviews";
import { assignmentForRequest, cancelParticipatingRequest } from "../persistence/commands/reviewer";
import {
  readReviewState,
  readMaterialVersions,
  readReviewCriteria,
  recordReviewChange,
} from "../persistence/commands/reviews";

/** Each new assessment version is one event; requests and cancellations are not assessments. */
const recordAssessmentVersion = async (
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  saved: {
    access: { organizationId: string; actor: { userId: string; name: string | null } };
    actor: Actor;
    row: NonNullable<Awaited<ReturnType<typeof readReviewState>>>;
  },
  change: SaveReviewRequest["change"],
  [before, after]: [ReviewState, ReviewState],
) => {
  const assessment =
    (change.action === "record" || change.action === "edit") && after.revision !== before.revision
      ? after.assessments.find((value) => value.id === change.id)
      : undefined;
  if (!assessment) {
    return;
  }

  await recordAuditEvent(tx, {
    organizationId: saved.access.organizationId,
    actor: {
      userId: saved.access.actor.userId,
      name: saved.access.actor.name,
      provenance: actorProvenance(saved.actor),
    },
    action: change.action === "edit" ? "assessment.corrected" : "assessment.recorded",
    target: {
      type: "assessment",
      id: assessment.id,
      revision: assessment.versions.length,
      name: saved.row.title,
    },
    context: { roundId: saved.row.roundId, applicationId: saved.row.publicId },
    details: {
      reviewer: assessment.reviewer,
      requestId: assessment.requestId,
      previousId: assessment.previousId,
      note: assessment.versions.at(-1)?.note ?? "",
    },
  });
};

const retryReviewCreation = (state: ReviewState, change: SaveReviewRequest["change"]) => {
  if (change.action === "request") {
    const existing = state.requests.find((value) => value.id === change.id);
    if (existing) {
      return existing.contactId === change.contactId
        ? ({ status: "ok", revision: state.revision } as const)
        : ({ status: "invalid", error: "invalid_review" } as const);
    }
  }
  if (change.action === "record") {
    const existing = state.assessments.find((value) => value.id === change.id);
    if (existing) {
      return existing.contactId === change.contactId &&
        existing.requestId === change.requestId &&
        existing.previousId === change.previousId &&
        JSON.stringify(existing.versions[0]?.content) === JSON.stringify(change.content)
        ? ({ status: "ok", revision: state.revision } as const)
        : ({ status: "invalid", error: "invalid_review" } as const);
    }
  }
  return null;
};

export const saveApplicationReview = async (
  db: Database,
  actor: Actor,
  input: SaveReviewRequest,
) => {
  const parsed = saveReviewRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_review" } as const;
  }

  const request = parsed.data;
  return db.transaction(async (tx) => {
    const access = await lockApplicationCase(tx, actor.userId, request);
    if (!access) {
      return { status: "not_found" } as const;
    }

    const row = await readReviewState(tx, access.organizationId, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }

    const { applicationVersion, reviews: state } = row;
    const change = request.change;
    // Creation identities survive response loss. A retry never appends another judgment.
    const retry = retryReviewCreation(state, change);
    if (retry) {
      return retry;
    }

    const round = await readReviewCriteria(tx, row.organizationId, row.roundId);
    if (!round) {
      return { status: "invalid", error: "criteria_unavailable" } as const;
    }
    const criteriaVersion = round.criteriaVersion;
    if (
      state.revision !== request.expectedRevision ||
      applicationVersion !== request.expectedApplicationVersion ||
      criteriaVersion !== request.expectedCriteriaVersion
    ) {
      return { status: "conflict" } as const;
    }

    const contact =
      change.action === "record" || change.action === "request"
        ? await readContact(tx, row.organizationId, change.contactId)
        : undefined;
    const availableVersions = await readMaterialVersions(tx, row.publicId);
    if (await hasAuthoredRequest(tx, row.publicId, change)) {
      return { status: "invalid", error: "reviewer_authored" } as const;
    }

    const result = prepareReviewChange(state, change, {
      contact,
      applicationVersion,
      availableVersions,
      criteriaVersion,
      criteriaHistory: round.criteriaHistory,
      recorder: {
        userId: access.actor.userId,
        provenance: actorProvenance(actor),
        name: access.actor.name ?? access.actor.email ?? "",
        recordedAt: new Date().toISOString(),
      },
    });
    if (!result.ok) {
      return { status: "invalid", error: result.error } as const;
    }

    await recordReviewChange(tx, row, result.state);
    await recordReviewEvents(tx, { access, actor, row }, change, [state, result.state]);
    await syncAssignmentCancellation(
      tx,
      row.publicId,
      change,
      actor,
      access.actor.name ?? access.actor.email ?? "",
    );
    return { status: "ok", revision: result.state.revision } as const;
  });
};

const syncAssignmentCancellation = async (
  db: Parameters<Parameters<Database["transaction"]>[0]>[0],
  caseId: string,
  change: SaveReviewRequest["change"],
  actor: Actor,
  name: string,
) => {
  const id =
    change.action === "cancel" ? change.id : change.action === "request" ? change.replacesId : null;
  if (id) {
    await cancelParticipatingRequest(db, caseId, id, actor, name);
  }
};

const hasAuthoredRequest = async (
  db: Parameters<Parameters<Database["transaction"]>[0]>[0],
  caseId: string,
  change: SaveReviewRequest["change"],
) =>
  change.action === "record" &&
  change.requestId &&
  (await assignmentForRequest(db, caseId, change.requestId));

const recordReviewEvents = async (
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  saved: Parameters<typeof recordAssessmentVersion>[1],
  change: SaveReviewRequest["change"],
  [before, after]: [ReviewState, ReviewState],
) => {
  for (const next of after.requests) {
    const previous = before.requests.find((item) => item.id === next.id);
    if (previous && (next.status === previous.status || next.status !== "cancelled")) {
      continue;
    }
    await recordAuditEvent(tx, {
      organizationId: saved.row.organizationId,
      actor: {
        userId: saved.actor.userId,
        name: saved.access.actor.name,
        provenance: actorProvenance(saved.actor),
      },
      action: previous ? "review_request.cancelled" : "review_request.created",
      target: {
        type: "review_request",
        id: next.id,
        revision: after.revision,
        name: saved.row.title,
      },
      context: { roundId: saved.row.roundId, applicationId: saved.row.publicId },
      details: {
        reviewer: next.reviewer,
        contactId: next.contactId,
        applicationVersion: next.applicationVersion,
        criteriaVersion: next.criteriaVersion,
        replacesId: change.action === "request" ? (change.replacesId ?? null) : null,
      },
    });
  }
  await recordAssessmentVersion(tx, saved, change, [before, after]);
};
