import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import type { Provenance } from "@merit/auth";
import type { Database } from "@merit/db";
import {
  criteriaVersionKey,
  readCriteriaByVersionsMap,
  type CriterionRecord,
} from "@merit/rounds/scope";

import {
  assessmentPositionSchema,
  reviewStateSchema,
  type ReviewState,
} from "../../domain/reviews";
import { reviewRevisionSchema } from "../../domain/versions";
import {
  assessments,
  assessmentVersionObservations,
  assessmentVersions,
  reviewRequests,
  reviewStates,
} from "./schema";

const requestRowShape = reviewStateSchema.shape.requests.element.shape;

type ReviewRequestItem = ReviewState["requests"][number];

type AssessmentItem = ReviewState["assessments"][number];

type AssessmentVersionItem = AssessmentItem["versions"][number];

type ObservationItem = AssessmentVersionItem["content"]["observations"][number];

export const hasReviewActivity = (caseId: string) => sql<boolean>`(
  exists (select 1 from ${reviewRequests} where ${reviewRequests.caseId} = ${caseId})
  or exists (select 1 from ${assessments} where ${assessments.caseId} = ${caseId})
)`;

export const reviewRevision = sql<number>`coalesce((select ${reviewStates.revision} from ${reviewStates} where ${reviewStates.caseId} = ${applicationCases.id}), 0)`;

const decodeProvenance = (
  interfaceValue: string | null,
  clientId: string | null,
): Provenance | undefined => {
  if (interfaceValue === "web") {
    return { interface: "web" };
  }
  if (interfaceValue === "mcp" && clientId) {
    return { interface: "mcp", clientId };
  }
  return undefined;
};

export const provenanceColumns = (provenance?: Provenance) => ({
  interfaceValue: provenance?.interface ?? null,
  clientId: provenance?.interface === "mcp" ? provenance.clientId : null,
});

const assembleRecorder = (
  userId: string | null,
  name: string | null,
  recordedAt: Date | null,
  provenanceInterface: string | null,
  provenanceClientId: string | null,
) => {
  if (userId === null || name === null || recordedAt === null) {
    return null;
  }
  const provenance = decodeProvenance(provenanceInterface, provenanceClientId);
  return {
    userId,
    name,
    recordedAt: recordedAt.toISOString(),
    ...(provenance ? { provenance } : {}),
  };
};

const assembleRequest = (
  row: typeof reviewRequests.$inferSelect,
  criteriaMap: Map<string, CriterionRecord[]>,
): ReviewState["requests"][number] => {
  const closedBy = assembleRecorder(
    row.closedByUserId,
    row.closedByName,
    row.closedByRecordedAt,
    row.closedByProvenanceInterface,
    row.closedByProvenanceClientId,
  );
  return {
    id: row.id,
    contactId: row.contactId,
    reviewer: row.reviewer,
    applicationVersion: requestRowShape.applicationVersion.parse(row.applicationVersion),
    criteriaVersion: requestRowShape.criteriaVersion.parse(row.criteriaVersion),
    criteria:
      criteriaMap.get(criteriaVersionKey(row.criteriaRoundPublicId, row.criteriaVersion)) ?? [],
    status: row.status,
    recorder: assembleRecorder(
      row.recorderUserId,
      row.recorderName,
      row.recorderRecordedAt,
      row.recorderProvenanceInterface,
      row.recorderProvenanceClientId,
    ),
    closedBy: closedBy
      ? {
          ...closedBy,
          ...(row.closedCause === "application_withdrawn"
            ? { cause: "application_withdrawn" as const }
            : {}),
        }
      : null,
  };
};

const assessmentVersionKey = (caseId: string, assessmentId: string, version: number) =>
  `${caseId}:${assessmentId}:${version}`;

const assessmentKey = (caseId: string, assessmentId: string) => `${caseId}:${assessmentId}`;

const assembleAssessmentVersion = (
  row: typeof assessmentVersions.$inferSelect,
  observations: ObservationItem[],
  criteriaMap: Map<string, CriterionRecord[]>,
): AssessmentVersionItem => ({
  content: {
    applicationVersion: requestRowShape.applicationVersion.nullable().parse(row.applicationVersion),
    criteriaVersion: requestRowShape.criteriaVersion.nullable().parse(row.criteriaVersion),
    date: row.assessedOn,
    position: assessmentPositionSchema.nullable().parse(row.position),
    amount:
      row.amountMinorUnits === null || row.amountCurrency === null
        ? null
        : { minorUnits: row.amountMinorUnits, currency: row.amountCurrency },
    reasoning: row.reasoning,
    observations,
  },
  criteria:
    row.criteriaRoundPublicId !== null && row.criteriaVersion !== null
      ? (criteriaMap.get(criteriaVersionKey(row.criteriaRoundPublicId, row.criteriaVersion)) ??
        null)
      : null,
  recorder: assembleRecorder(
    row.recorderUserId,
    row.recorderName,
    row.recorderRecordedAt,
    row.recorderProvenanceInterface,
    row.recorderProvenanceClientId,
  ),
  note: row.note,
});

const collectCriteriaPairs = (
  requests: (typeof reviewRequests.$inferSelect)[],
  versions: (typeof assessmentVersions.$inferSelect)[],
) => {
  const pairs: { roundId: string; version: number }[] = [];
  for (const request of requests) {
    pairs.push({ roundId: request.criteriaRoundPublicId, version: request.criteriaVersion });
  }
  for (const version of versions) {
    if (version.criteriaRoundPublicId !== null && version.criteriaVersion !== null) {
      pairs.push({ roundId: version.criteriaRoundPublicId, version: version.criteriaVersion });
    }
  }
  return pairs;
};

const groupObservations = (rows: (typeof assessmentVersionObservations.$inferSelect)[]) => {
  const result = new Map<string, ObservationItem[]>();
  for (const row of rows) {
    const key = assessmentVersionKey(row.caseId, row.assessmentId, row.version);
    const list = result.get(key) ?? [];
    list.push({ criterionId: row.criterionId, criterion: row.criterion, text: row.text });
    result.set(key, list);
  }
  return result;
};

const groupVersionsByAssessment = (
  rows: (typeof assessmentVersions.$inferSelect)[],
  observationsByVersion: Map<string, ObservationItem[]>,
  criteriaMap: Map<string, CriterionRecord[]>,
) => {
  const result = new Map<string, AssessmentVersionItem[]>();
  for (const row of rows) {
    const key = assessmentKey(row.caseId, row.assessmentId);
    const list = result.get(key) ?? [];
    list.push(
      assembleAssessmentVersion(
        row,
        observationsByVersion.get(
          assessmentVersionKey(row.caseId, row.assessmentId, row.version),
        ) ?? [],
        criteriaMap,
      ),
    );
    result.set(key, list);
  }
  return result;
};

export const readReviewsByCasesMap = async (
  db: Database,
  caseIds: string[],
): Promise<Map<string, ReviewState>> => {
  const uniqueCaseIds = [...new Set(caseIds)];
  const result = new Map<string, ReviewState>();
  if (uniqueCaseIds.length === 0) {
    return result;
  }

  const [stateRows, requestRows, assessmentRows, versionRows, observationRows] = await Promise.all([
    db.select().from(reviewStates).where(inArray(reviewStates.caseId, uniqueCaseIds)),
    db
      .select()
      .from(reviewRequests)
      .where(inArray(reviewRequests.caseId, uniqueCaseIds))
      .orderBy(asc(reviewRequests.position)),
    db
      .select()
      .from(assessments)
      .where(inArray(assessments.caseId, uniqueCaseIds))
      .orderBy(asc(assessments.position)),
    db
      .select()
      .from(assessmentVersions)
      .where(inArray(assessmentVersions.caseId, uniqueCaseIds))
      .orderBy(asc(assessmentVersions.version)),
    db
      .select()
      .from(assessmentVersionObservations)
      .where(inArray(assessmentVersionObservations.caseId, uniqueCaseIds))
      .orderBy(asc(assessmentVersionObservations.position)),
  ]);

  const criteriaMap = await readCriteriaByVersionsMap(
    db,
    collectCriteriaPairs(requestRows, versionRows),
  );
  const versionsByAssessment = groupVersionsByAssessment(
    versionRows,
    groupObservations(observationRows),
    criteriaMap,
  );
  const revisionByCase = new Map(stateRows.map((row) => [row.caseId, row.revision]));

  for (const caseId of uniqueCaseIds) {
    result.set(caseId, {
      revision: reviewRevisionSchema.parse(revisionByCase.get(caseId) ?? 0),
      requests: [],
      assessments: [],
    });
  }
  for (const request of requestRows) {
    result.get(request.caseId)?.requests.push(assembleRequest(request, criteriaMap));
  }
  for (const assessment of assessmentRows) {
    result.get(assessment.caseId)?.assessments.push({
      id: assessment.id,
      contactId: assessment.contactId,
      reviewer: assessment.reviewer,
      requestId: assessment.requestId,
      previousId: assessment.previousId,
      authorUserId: assessment.authorUserId,
      versions: versionsByAssessment.get(assessmentKey(assessment.caseId, assessment.id)) ?? [],
    });
  }

  return result;
};

export const readReviewRequestRecord = async (
  db: Database,
  caseId: string,
  requestId: string,
): Promise<ReviewRequestItem | undefined> => {
  const [request] = await db
    .select()
    .from(reviewRequests)
    .where(and(eq(reviewRequests.caseId, caseId), eq(reviewRequests.id, requestId)));
  if (!request) {
    return undefined;
  }
  const criteriaMap = await readCriteriaByVersionsMap(db, [
    { roundId: request.criteriaRoundPublicId, version: request.criteriaVersion },
  ]);
  return assembleRequest(request, criteriaMap);
};

export const readAssessmentRecord = async (
  db: Database,
  caseId: string,
  assessmentId: string,
): Promise<AssessmentItem | undefined> => {
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.caseId, caseId), eq(assessments.id, assessmentId)));
  if (!assessment) {
    return undefined;
  }
  const [versionRows, observationRows] = await Promise.all([
    db
      .select()
      .from(assessmentVersions)
      .where(
        and(
          eq(assessmentVersions.caseId, caseId),
          eq(assessmentVersions.assessmentId, assessmentId),
        ),
      )
      .orderBy(asc(assessmentVersions.version)),
    db
      .select()
      .from(assessmentVersionObservations)
      .where(
        and(
          eq(assessmentVersionObservations.caseId, caseId),
          eq(assessmentVersionObservations.assessmentId, assessmentId),
        ),
      )
      .orderBy(asc(assessmentVersionObservations.position)),
  ]);
  const criteriaMap = await readCriteriaByVersionsMap(db, collectCriteriaPairs([], versionRows));
  const versionsByAssessment = groupVersionsByAssessment(
    versionRows,
    groupObservations(observationRows),
    criteriaMap,
  );
  return {
    id: assessment.id,
    contactId: assessment.contactId,
    reviewer: assessment.reviewer,
    requestId: assessment.requestId,
    previousId: assessment.previousId,
    authorUserId: assessment.authorUserId,
    versions: versionsByAssessment.get(assessmentKey(caseId, assessment.id)) ?? [],
  };
};

export { reviewOverview } from "./overview";
export { readReviewSummaryPage, reviewAssignmentMatch } from "./summary-entries";
export { readAiReviewRecords } from "./ai-reviews";
