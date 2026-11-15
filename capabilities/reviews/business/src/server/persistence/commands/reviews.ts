import { and, eq } from "drizzle-orm";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import type { Database } from "@merit/db";
import { fundingRoundSchema } from "@merit/rounds/domain";
import { readRoundCriteria } from "@merit/rounds/scope";

import { reviewStateSchema, type ReviewState } from "../../../domain/reviews";
import { provenanceColumns, readReviewsByCasesMap } from "../projections";
import {
  assessments,
  assessmentVersionObservations,
  assessmentVersions,
  reviewRequests,
  reviewStates,
} from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ReviewRecorder = ReviewState["requests"][number]["recorder"];

type ReviewClosure = ReviewState["requests"][number]["closedBy"];

const recorderValues = (recorder: ReviewRecorder) => {
  if (!recorder) {
    return {
      userId: null,
      name: null,
      recordedAt: null,
      provenanceInterface: null,
      provenanceClientId: null,
    };
  }
  const provenance = provenanceColumns(recorder.provenance);
  return {
    userId: recorder.userId,
    name: recorder.name,
    recordedAt: new Date(recorder.recordedAt),
    provenanceInterface: provenance.interfaceValue,
    provenanceClientId: provenance.clientId,
  };
};

const closureValues = (closedBy: ReviewClosure) => ({
  ...recorderValues(closedBy),
  cause: closedBy?.cause ?? null,
});

export const readReviewState = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select({
      publicId: applicationCases.id,
      title: materialVersions.title,
      organizationId: applicationCases.organizationId,
      roundId: applicationCases.roundId,
      applicationVersion: applicationCases.materialVersion,
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .where(
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, publicId)),
    );
  if (!row) {
    return undefined;
  }

  const reviewsMap = await readReviewsByCasesMap(db, [row.publicId]);
  return {
    ...row,
    applicationVersion: materialVersionSchema.parse(row.applicationVersion),
    reviews: reviewStateSchema.parse(reviewsMap.get(row.publicId)),
  };
};

export const readReviewCriteria = async (
  db: Transaction,
  organizationId: string,
  roundId: string,
) => {
  const row = await readRoundCriteria(db, organizationId, roundId);
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
  roundId: string;
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
        const closed = closureValues(request.closedBy);
        await db
          .update(reviewRequests)
          .set({
            status: request.status,
            closedByUserId: closed.userId,
            closedByName: closed.name,
            closedByRecordedAt: closed.recordedAt,
            closedByProvenanceInterface: closed.provenanceInterface,
            closedByProvenanceClientId: closed.provenanceClientId,
            closedCause: closed.cause,
          })
          .where(and(eq(reviewRequests.caseId, owner.publicId), eq(reviewRequests.id, request.id)));
      }
    } else {
      const recorder = recorderValues(request.recorder);
      const closed = closureValues(request.closedBy);
      await db.insert(reviewRequests).values({
        organizationId: owner.organizationId,
        caseId: owner.publicId,
        id: request.id,
        contactId: request.contactId,
        reviewer: request.reviewer,
        applicationVersion: request.applicationVersion,
        criteriaRoundPublicId: owner.roundId,
        criteriaVersion: request.criteriaVersion,
        status: request.status,
        recorderUserId: recorder.userId,
        recorderName: recorder.name,
        recorderRecordedAt: recorder.recordedAt,
        recorderProvenanceInterface: recorder.provenanceInterface,
        recorderProvenanceClientId: recorder.provenanceClientId,
        closedByUserId: closed.userId,
        closedByName: closed.name,
        closedByRecordedAt: closed.recordedAt,
        closedByProvenanceInterface: closed.provenanceInterface,
        closedByProvenanceClientId: closed.provenanceClientId,
        closedCause: closed.cause,
        position,
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
    if (!previous) {
      await db.insert(assessments).values({
        organizationId: owner.organizationId,
        caseId: owner.publicId,
        id: assessment.id,
        contactId: assessment.contactId,
        reviewer: assessment.reviewer,
        requestId: assessment.requestId,
        previousId: assessment.previousId,
        authorUserId: assessment.authorUserId ?? null,
        position,
      });
    }
    const recordedVersions = previous?.versions.length ?? 0;
    for (const [index, entry] of assessment.versions.slice(recordedVersions).entries()) {
      const versionNumber = recordedVersions + index + 1;
      const recorder = recorderValues(entry.recorder);
      await db.insert(assessmentVersions).values({
        organizationId: owner.organizationId,
        caseId: owner.publicId,
        assessmentId: assessment.id,
        version: versionNumber,
        applicationVersion: entry.content.applicationVersion,
        criteriaRoundPublicId: entry.content.criteriaVersion === null ? null : owner.roundId,
        criteriaVersion: entry.content.criteriaVersion,
        assessedOn: entry.content.date,
        position: entry.content.position,
        amount: entry.content.amount,
        reasoning: entry.content.reasoning,
        recorderUserId: recorder.userId,
        recorderName: recorder.name,
        recorderRecordedAt: recorder.recordedAt,
        recorderProvenanceInterface: recorder.provenanceInterface,
        recorderProvenanceClientId: recorder.provenanceClientId,
        note: entry.note,
      });
      if (entry.content.observations.length > 0) {
        await db.insert(assessmentVersionObservations).values(
          entry.content.observations.map((observation, obsIndex) => ({
            caseId: owner.publicId,
            assessmentId: assessment.id,
            version: versionNumber,
            position: obsIndex,
            criterionId: observation.criterionId,
            criterion: observation.criterion,
            text: observation.text,
          })),
        );
      }
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
