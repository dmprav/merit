import { and, eq, sql } from "drizzle-orm";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import type { Database } from "@merit/db";
import { fundingRoundSchema } from "@merit/rounds/domain";
import { fundingRounds } from "@merit/rounds/schema";
import { currentCriteria, criteriaHistory } from "@merit/rounds/scope";

import { reviewStateSchema, type ReviewState } from "../../../domain/reviews";
import { currentReviews } from "../projections";
import { reviewRequests, assessments, assessmentVersions, reviewStates } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const readReviewState = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select({
      publicId: applicationCases.id,
      organizationId: applicationCases.organizationId,
      roundId: applicationCases.roundId,
      applicationVersion: applicationCases.materialVersion,
      // Nest correlated SQL so Drizzle's single-table selection preserves table qualifiers.
      reviews: sql<unknown>`${currentReviews}`,
    })
    .from(applicationCases)
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, publicId)),
    );
  if (!row) {
    return undefined;
  }

  return {
    ...row,
    applicationVersion: materialVersionSchema.parse(row.applicationVersion),
    reviews: reviewStateSchema.parse(row.reviews),
  };
};

export const readReviewCriteria = async (
  db: Transaction,
  organizationId: string,
  roundId: string | null,
) => {
  if (roundId === null) {
    return undefined;
  }

  const [row] = await db
    .select({
      criteria: sql<unknown>`${currentCriteria}`,
      criteriaVersion: fundingRounds.criteriaVersion,
      criteriaHistory: sql<unknown>`${criteriaHistory}`,
    })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)));
  return row
    ? fundingRoundSchema
        .pick({ criteria: true, criteriaVersion: true, criteriaHistory: true })
        .parse(row)
    : undefined;
};

export const readMaterialVersions = async (db: Transaction, publicId: string) => {
  const rows = await db
    .select({ version: materialVersions.version })
    .from(materialVersions)
    .where(eq(materialVersions.caseId, publicId));
  return rows.map((row) => materialVersionSchema.parse(row.version));
};

type ReviewOwner = {
  publicId: string;
  organizationId: string;
  roundId: string | null;
  reviews: ReviewState | null;
};

const recordReviewRequests = async (
  db: Transaction,
  owner: ReviewOwner,
  requests: ReviewState["requests"],
) => {
  const previousRequests = new Map(
    (owner.reviews?.requests ?? []).map((request) => [request.id, request]),
  );
  for (const [position, request] of requests.entries()) {
    const previous = previousRequests.get(request.id);
    if (previous) {
      if (request.status !== previous.status) {
        await db
          .update(reviewRequests)
          .set({ status: request.status, closedBy: request.closedBy })
          .where(and(eq(reviewRequests.caseId, owner.publicId), eq(reviewRequests.id, request.id)));
      }
    } else {
      const { criteria: _criteria, ...content } = request;
      await db.insert(reviewRequests).values({
        ...content,
        organizationId: owner.organizationId,
        caseId: owner.publicId,
        position,
        criteriaRoundPublicId: request.criteriaVersion === null ? null : owner.roundId,
      });
    }
  }
};

const recordAssessments = async (
  db: Transaction,
  owner: ReviewOwner,
  records: ReviewState["assessments"],
) => {
  const previousAssessments = new Map(
    (owner.reviews?.assessments ?? []).map((assessment) => [assessment.id, assessment]),
  );
  for (const [position, assessment] of records.entries()) {
    const previous = previousAssessments.get(assessment.id);
    const { versions, ...content } = assessment;
    if (!previous) {
      await db.insert(assessments).values({
        ...content,
        organizationId: owner.organizationId,
        caseId: owner.publicId,
        position,
      });
    }
    const recordedVersions = previous?.versions.length ?? 0;
    for (const [index, version] of versions.slice(recordedVersions).entries()) {
      await db.insert(assessmentVersions).values({
        organizationId: owner.organizationId,
        caseId: owner.publicId,
        assessmentId: assessment.id,
        version: recordedVersions + index + 1,
        applicationVersion: version.content.applicationVersion,
        criteriaVersion: version.content.criteriaVersion,
        criteriaRoundPublicId: version.content.criteriaVersion === null ? null : owner.roundId,
        content: version.content,
        recorder: version.recorder,
        note: version.note,
      });
    }
  }
};

/** Record an accepted transition under the caller's case lock and transaction.
 * A null prior state is reserved for seeding a new case. */
export const recordReviewChange = async (
  db: Transaction,
  owner: ReviewOwner,
  state: ReviewState,
) => {
  if (state.revision === owner.reviews?.revision) {
    return;
  }

  await recordReviewRequests(db, owner, state.requests);
  await recordAssessments(db, owner, state.assessments);
  await db
    .insert(reviewStates)
    .values({ caseId: owner.publicId, revision: state.revision })
    .onConflictDoUpdate({ target: reviewStates.caseId, set: { revision: state.revision } });
};
