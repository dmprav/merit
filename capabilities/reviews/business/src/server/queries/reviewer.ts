import { encodeApplicationMaterial } from "@merit/applications/api";
import { materialVersionSchema } from "@merit/applications/domain";
import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import type { ReviewerSummary, ReviewerService } from "../../api/reviewer";
import { compareReviewBasis, reviewCriteriaSchema } from "../../domain";
import {
  activeReviewer,
  reviewerIdentityCurrent,
  reviewerOwns,
  permittedReviewerWork,
  readReviewerRecord,
  listReviewerRecords,
  listManagerReviewerRecords,
  readPrivateReviewerDraft,
  readReviewerEvidence,
  readReviewerAssessment,
  reviewerHistory,
  type ReviewerRecord,
} from "../persistence/reviewer-records";

const reviewerSummary = (row: ReviewerRecord): ReviewerSummary => {
  const basisComparison = compareReviewBasis(
    {
      applicationVersion: materialVersionSchema.nullable().parse(row.applicationVersion),
      criteriaVersion: criteriaVersionSchema.nullable().parse(row.criteriaVersion),
      criteria: reviewCriteriaSchema.nullable().parse(row.criteria),
    },
    {
      applicationVersion: materialVersionSchema.parse(row.currentVersion),
      criteriaVersion: criteriaVersionSchema.parse(row.currentCriteriaVersion),
      criteria: reviewCriteriaSchema.nullable().parse(row.currentCriteria),
    },
  );
  return {
    basisComparison,
    id: row.assignment.id,
    requestId: row.assignment.requestId,
    revision: row.assignment.revision,
    status: row.assignment.status,
    reviewer: row.reviewer,
    hasSubmitted: row.assignment.assessmentId !== null,
    email: row.assignment.email,
    applicationTitle: row.title,
    applicant: row.applicant,
    organization: row.organization,
    dueDate: row.assignment.dueDate,
    managerName: row.assignment.managerName,
    managerEmail: row.assignment.managerEmail,
    applicationVersion: row.applicationVersion!,
    criteriaVersion: row.criteriaVersion!,
    materialChanged: basisComparison.applicationVersion === "different",
    criteriaChanged: basisComparison.criteriaContent === "different",
    conflict: row.assignment.conflict,
    delivery: row.delivery,
    notification: row.notification,
    expiresAt: row.assignment.expiresAt.toISOString(),
  };
};

export const listReviewerAssignments = (
  db: Database,
  actor: Actor,
  emails: string[],
): ReturnType<ReviewerService["list"]> =>
  readTransaction(db, async (tx) => {
    if (!(await activeReviewer(tx, actor.userId))) {
      return { status: "not_found" };
    }
    return {
      status: "ok",
      value: (await listReviewerRecords(tx, actor.userId, emails)).map(reviewerSummary),
    };
  });

export const readReviewerAssignment = (
  db: Database,
  actor: Actor,
  emails: string[],
  id: string,
): ReturnType<ReviewerService["read"]> =>
  readTransaction(db, async (tx) => {
    const record = await readReviewerRecord(tx, id);
    if (
      !record ||
      !(await activeReviewer(tx, actor.userId)) ||
      !reviewerOwns(record, actor.userId, emails) ||
      !(await reviewerIdentityCurrent(tx, id))
    ) {
      return { status: "not_found" };
    }
    const assignment = reviewerSummary(record);
    if (!(await permittedReviewerWork(tx, id, actor.userId))) {
      return {
        status: "ok",
        value: { assignment, material: null, criteria: null, draft: null, assessment: null },
      };
    }
    const evidence = await readReviewerEvidence(tx, record);
    const draft = await readPrivateReviewerDraft(tx, id);
    return {
      status: "ok",
      value: {
        assignment,
        material: encodeApplicationMaterial(evidence.material),
        criteria: evidence.criteria,
        draft: draft ? { revision: draft.revision, content: draft.content } : null,
        assessment: await readReviewerAssessment(tx, record),
      },
    };
  });

export const managerReviewerAssignments = (
  db: Database,
  actor: Actor,
  input: Parameters<ReviewerService["forApplication"]>[1],
): ReturnType<ReviewerService["forApplication"]> =>
  readTransaction(db, async (tx) => ({
    status: "ok",
    value: await Promise.all(
      (await listManagerReviewerRecords(tx, actor.userId, input)).map(async (row) => ({
        ...reviewerSummary(row),
        history: (await reviewerHistory(tx, row.assignment.id)).map((event) => ({
          ...event,
          at: event.at.toISOString(),
        })),
      })),
    ),
  }));
