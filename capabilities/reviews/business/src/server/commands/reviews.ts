import { lockApplicationCase } from "@merit/applications/locks";
import { actorProvenance, type Actor } from "@merit/auth";
import { readContact } from "@merit/contacts/scope";
import type { Database } from "@merit/db";

import { saveReviewRequestSchema, type SaveReviewRequest } from "../../api/commands/reviews";
import { prepareReviewChange } from "../../domain/reviews";
import { assignmentForRequest, cancelParticipatingRequest } from "../persistence/commands/reviewer";
import {
  readReviewState,
  readMaterialVersions,
  readReviewCriteria,
  recordReviewChange,
} from "../persistence/commands/reviews";

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
    if (
      (change.action === "request" && state.requests.some((value) => value.id === change.id)) ||
      (change.action === "record" && state.assessments.some((value) => value.id === change.id))
    ) {
      return { status: "ok", revision: state.revision } as const;
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
  db: Database,
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
  db: Database,
  caseId: string,
  change: SaveReviewRequest["change"],
) =>
  change.action === "record" &&
  change.requestId &&
  (await assignmentForRequest(db, caseId, change.requestId));
