import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";

import {
  applicationCases,
  materialDrafts,
  materialVersionAnswers,
  materialVersionEvidence,
  materialVersions,
} from "@merit/applications/schema";
import {
  assembleApplicationDetails,
  assembleCurrentSubmission,
  caseWithdrawn,
  readContactsProfileMap,
  readMaterialVersionRecord,
  readWorkingRevisionsMap,
  requestedMoneyData,
} from "@merit/applications/scope";
import { auditEvents } from "@merit/audit/schema";
import type { Database } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";
import { recommendationVersions } from "@merit/recommendations/schema";
import {
  assembleRecommendationRecord,
  decodeProvenanceColumns,
  readCurrentRecommendationsMap,
  recommendationRevision,
} from "@merit/recommendations/scope";
import { reviewAssignments } from "@merit/reviews/participation-schema";
import { assessments, assessmentVersions, reviewRequests } from "@merit/reviews/schema";
import {
  readAssessmentRecord,
  readReviewRequestRecord,
  readReviewsByCasesMap,
  reviewRevision,
} from "@merit/reviews/scope";
import { fundingRounds } from "@merit/rounds/schema";
import {
  assembleRoundRecord,
  criteriaVersionKey,
  managerNeedsReassignment,
  readCriteriaByVersionsMap,
  readCriteriaVersionsMap,
  readRoundCriteria,
  toMoneyData,
} from "@merit/rounds/scope";

import { roundFinancialTotals } from "./round-totals";

const roundFields = {
  roundId: fundingRounds.id,
  title: fundingRounds.title,
  preparationRevision: fundingRounds.revision,
  criteriaVersion: fundingRounds.criteriaVersion,
  budgetMinorUnits: fundingRounds.budget,
  currency: fundingRounds.currency,
  applicationCount: sql<number>`(select count(*)::integer from ${applicationCases} a where a.organization_id = ${fundingRounds.organizationId} and a.round_id = ${fundingRounds.id})`,
};

const applicationFields = {
  applicationId: applicationCases.id,
  roundId: fundingRounds.id,
  title: materialVersions.title,
  applicationVersion: applicationCases.materialVersion,
  intakeRevision: applicationCases.revision,
  reviewRevision,
  recommendationRevision,
  intakeStatus: applicationCases.intakeStatus,
  withdrawn: caseWithdrawn,
  requestedMinorUnits: materialVersions.requestedMinorUnits,
  requestedCurrency: materialVersions.requestedCurrency,
  contactId: applicationCases.contactId,
  hasWorkingRevision: sql<boolean>`exists(select 1 from ${materialDrafts} where ${materialDrafts.caseId} = ${applicationCases.id})`,
};

const withRoundBudget = <T extends { budgetMinorUnits: string | null; currency: string }>({
  budgetMinorUnits,
  currency,
  ...rest
}: T) => ({
  ...rest,
  budget: toMoneyData(budgetMinorUnits, currency),
});

const withRequestedMoney = <
  T extends { requestedMinorUnits: string | null; requestedCurrency: string | null },
>({
  requestedMinorUnits,
  requestedCurrency,
  ...rest
}: T) => ({
  ...rest,
  requested: requestedMoneyData(requestedMinorUnits, requestedCurrency),
});

export const readGrantWorkspaceAccess = async (db: Database, actor: string, slug: string) => {
  const workspace = authorizedWorkspaces(db, actor, "read_workspace", slug);
  const [row] = await db
    .select({ organizationId: workspace.id, allowed: workspace.canWorkOnGrants })
    .from(workspace);
  return row;
};

export const readRoundSummaries = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const rows = await db
    .select(roundFields)
    .from(fundingRounds)
    .innerJoin(workspace, eq(workspace.id, fundingRounds.organizationId))
    .where(and(input.after ? gt(fundingRounds.id, input.after) : undefined))
    .orderBy(fundingRounds.id)
    .limit(input.limit + 1);
  return rows.map(withRoundBudget);
};

export const readRoundIdentity = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; roundId: string },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const [row] = await db
    .select({ roundId: fundingRounds.id, organizationId: workspace.id })
    .from(fundingRounds)
    .innerJoin(workspace, eq(workspace.id, fundingRounds.organizationId))
    .where(eq(fundingRounds.id, input.roundId));
  return row;
};

export const readApplicationIdentity = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; applicationId: string },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const [row] = await db
    .select({ applicationId: applicationCases.id, organizationId: workspace.id })
    .from(applicationCases)
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(eq(applicationCases.id, input.applicationId));
  return row;
};

export const readRoundOverview = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; roundId: string },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const totals = roundFinancialTotals(db);
  const [row] = await db
    .select({
      ...roundFields,
      managerUserId: fundingRounds.managerUserId,
      managerNeedsReassignment,
      applicationCount: totals.applicationCount,
      requested: totals.requested,
      unknownRequests: totals.unknownRequests,
      withdrawnApplications: totals.withdrawnApplications,
      proposed: totals.proposed,
    })
    .from(fundingRounds)
    .innerJoin(workspace, eq(workspace.id, fundingRounds.organizationId))
    .crossJoinLateral(totals)
    .where(eq(fundingRounds.id, input.roundId));
  return row ? withRoundBudget(row) : undefined;
};

export const readApplicationSummaries = async (
  db: Database,
  actor: string,
  input: {
    workspaceSlug: string;
    roundId?: string;
    contactId?: string;
    after?: string;
    limit: number;
  },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const relationships = input.contactId
    ? {
        applicantContact: sql<boolean>`coalesce(${applicationCases.contactId} = ${input.contactId}, false)`,
        reviewRequested: sql<boolean>`exists(select 1 from ${reviewRequests} where ${reviewRequests.caseId} = ${applicationCases.id} and ${reviewRequests.contactId} = ${input.contactId})`,
        assessmentRecorded: sql<boolean>`exists(select 1 from ${assessments} where ${assessments.caseId} = ${applicationCases.id} and ${assessments.contactId} = ${input.contactId})`,
      }
    : undefined;
  const rows = await db
    .select({
      ...applicationFields,
      ...(relationships ? { roundTitle: fundingRounds.title, ...relationships } : {}),
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(
      and(
        input.roundId ? eq(fundingRounds.id, input.roundId) : undefined,
        relationships ? or(...Object.values(relationships)) : undefined,
        input.after ? gt(applicationCases.id, input.after) : undefined,
      ),
    )
    .orderBy(applicationCases.id)
    .limit(input.limit + 1);
  return rows.map(withRequestedMoney);
};

export const readApplicationContext = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; applicationId: string },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const [row] = await db
    .select({
      ...applicationFields,
      criteriaVersion: fundingRounds.criteriaVersion,
      roundPreparationRevision: fundingRounds.revision,
      lastIntakeRevision: applicationCases.revision,
      lastRecommendationRevision: recommendationRevision,
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(eq(applicationCases.id, input.applicationId));
  return row ? withRequestedMoney(row) : undefined;
};

// Slicing serialized sections by Unicode code points bounds payloads at the server boundary,
// with a content fingerprint binding every subsequent chunk to the same snapshot.
const sliceJsonValue = async (value: unknown, offset: number, length: number) => {
  const json = JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  const fingerprint = Array.from(new Uint8Array(digest).subarray(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const chars = Array.from(json);
  return {
    content: chars.slice(offset, offset + length).join(""),
    fingerprint,
    totalCharacters: chars.length,
  };
};

const readIntakeOrPreparationChange = async (
  db: Database,
  actor: string,
  input: {
    workspaceSlug: string;
    recordId: string;
    revision: number;
    offset: number;
    length: number;
  },
  kind: "intake" | "preparation",
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const [row] = await db
    .select({
      revision: auditEvents.targetRevision,
      action: auditEvents.action,
      details: auditEvents.details,
      actorUserId: auditEvents.actorUserId,
      actorName: auditEvents.actorName,
      formatVersion: auditEvents.formatVersion,
      provenance: auditEvents.provenance,
      recordedAt: auditEvents.recordedAt,
    })
    .from(auditEvents)
    .innerJoin(workspace, eq(workspace.id, auditEvents.organizationId))
    .where(
      and(
        eq(auditEvents.targetId, input.recordId),
        eq(auditEvents.targetType, kind === "intake" ? "application" : "round"),
        eq(auditEvents.targetRevision, input.revision),
      ),
    );
  if (!row) {
    return undefined;
  }
  const details = (row.details ?? {}) as Record<string, unknown>;
  return sliceJsonValue(
    {
      revision: row.revision,
      action: row.action,
      reason: details.reason ?? null,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      formatVersion: row.formatVersion,
      provenance: row.provenance,
      recordedAt: row.recordedAt.toISOString(),
      before: details.before ?? null,
      after: details.after ?? null,
    },
    input.offset,
    input.length,
  );
};

export const readRoundContent = async (
  db: Database,
  actor: string,
  input: {
    workspaceSlug: string;
    roundId: string;
    section: "details" | "criteria" | "criteria_history" | "preparation_change";
    revision?: number;
    offset: number;
    length: number;
  },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  if (input.section === "preparation_change") {
    return readIntakeOrPreparationChange(
      db,
      actor,
      { ...input, recordId: input.roundId, revision: input.revision ?? -1 },
      "preparation",
    );
  }
  const [row] = await db
    .select({ round: fundingRounds, foundation: workspace.name })
    .from(fundingRounds)
    .innerJoin(workspace, eq(workspace.id, fundingRounds.organizationId))
    .where(eq(fundingRounds.id, input.roundId));
  if (!row) {
    return undefined;
  }

  if (input.section === "details") {
    const {
      criteria: _criteria,
      criteriaVersion: _criteriaVersion,
      criteriaHistory: _criteriaHistory,
      ...details
    } = assembleRoundRecord(row.round, row.foundation, []);
    return sliceJsonValue(details, input.offset, input.length);
  }
  if (input.section === "criteria") {
    const roundCriteria = await readRoundCriteria(db, row.round.organizationId, row.round.id);
    return sliceJsonValue(roundCriteria?.criteria ?? [], input.offset, input.length);
  }
  const historyMap = await readCriteriaVersionsMap(db, [row.round.id]);
  return sliceJsonValue(historyMap.get(row.round.id) ?? [], input.offset, input.length);
};

type ApplicationContentInput = {
  workspaceSlug: string;
  applicationId: string;
  section:
    | "details"
    | "submission"
    | "material"
    | "evidence"
    | "reviews"
    | "assessment"
    | "review_request"
    | "working_revision"
    | "recommendation"
    | "intake_change"
    | "recommendation_change";
  entryId?: string;
  materialVersion?: number;
  revision?: number;
  offset: number;
  length: number;
};

const readCurrentSubmissionPayload = async (
  db: Database,
  caseRow: typeof applicationCases.$inferSelect,
  materialRow: typeof materialVersions.$inferSelect,
) => {
  const [answerRows, contactsMap] = await Promise.all([
    materialRow.hasSubmission
      ? db
          .select()
          .from(materialVersionAnswers)
          .where(
            and(
              eq(materialVersionAnswers.caseId, caseRow.id),
              eq(materialVersionAnswers.materialVersion, caseRow.materialVersion),
            ),
          )
          .orderBy(asc(materialVersionAnswers.position))
      : Promise.resolve([]),
    readContactsProfileMap(db, caseRow.organizationId, [caseRow.contactId]),
  ]);
  const answers = answerRows.map((a) => ({
    questionId: a.questionId,
    question: a.question,
    response: a.response,
  }));
  const contact = caseRow.contactId ? contactsMap.get(caseRow.contactId) : undefined;
  return assembleCurrentSubmission(materialRow, answers, contact) ?? null;
};

const readRecommendationChangePayload = async (db: Database, caseId: string, revision: number) => {
  const [current] = await db
    .select()
    .from(recommendationVersions)
    .where(
      and(eq(recommendationVersions.caseId, caseId), eq(recommendationVersions.revision, revision)),
    );
  if (!current) {
    return undefined;
  }
  const [previous] = await db
    .select()
    .from(recommendationVersions)
    .where(
      and(eq(recommendationVersions.caseId, caseId), lt(recommendationVersions.revision, revision)),
    )
    .orderBy(desc(recommendationVersions.revision))
    .limit(1);
  return {
    revision: current.revision,
    actorUserId: current.actorUserId,
    provenance:
      decodeProvenanceColumns(current.provenanceInterface, current.provenanceClientId) ?? null,
    recordedAt: current.recordedAt.toISOString(),
    before: previous ? assembleRecommendationRecord(previous) : null,
    after: assembleRecommendationRecord(current),
  };
};

const readCurrentDetailsOrSubmission = async (
  db: Database,
  caseRow: typeof applicationCases.$inferSelect,
  section: "details" | "submission",
) => {
  const [materialRow] = await db
    .select()
    .from(materialVersions)
    .where(
      and(
        eq(materialVersions.caseId, caseRow.id),
        eq(materialVersions.version, caseRow.materialVersion),
      ),
    );
  if (!materialRow) {
    return { found: false };
  }
  return {
    found: true,
    value:
      section === "details"
        ? assembleApplicationDetails(caseRow, materialRow)
        : await readCurrentSubmissionPayload(db, caseRow, materialRow),
  };
};

const readEvidenceSection = async (db: Database, caseRow: typeof applicationCases.$inferSelect) => {
  const rows = await db
    .select()
    .from(materialVersionEvidence)
    .where(
      and(
        eq(materialVersionEvidence.caseId, caseRow.id),
        eq(materialVersionEvidence.materialVersion, caseRow.materialVersion),
      ),
    )
    .orderBy(asc(materialVersionEvidence.position));
  return {
    found: true,
    value: rows.map((row) => ({ version: row.evidenceVersion, passage: row.passage })),
  };
};

const optionalResult = (value: unknown) => (value ? { found: true, value } : { found: false });

type SectionReader = (
  db: Database,
  caseRow: typeof applicationCases.$inferSelect,
  input: ApplicationContentInput,
) => Promise<{ found: boolean; value?: unknown }>;

const sectionReaders: Partial<Record<ApplicationContentInput["section"], SectionReader>> = {
  details: (db, caseRow) => readCurrentDetailsOrSubmission(db, caseRow, "details"),
  submission: (db, caseRow) => readCurrentDetailsOrSubmission(db, caseRow, "submission"),
  material: async (db, caseRow, input) =>
    optionalResult(await readMaterialVersionRecord(db, caseRow.id, input.materialVersion ?? -1)),
  evidence: (db, caseRow) => readEvidenceSection(db, caseRow),
  reviews: async (db, caseRow) => ({
    found: true,
    value: (await readReviewsByCasesMap(db, [caseRow.id])).get(caseRow.id),
  }),
  assessment: async (db, caseRow, input) =>
    optionalResult(await readAssessmentRecord(db, caseRow.id, input.entryId ?? "")),
  review_request: async (db, caseRow, input) =>
    optionalResult(await readReviewRequestRecord(db, caseRow.id, input.entryId ?? "")),
  working_revision: async (db, caseRow) => ({
    found: true,
    value: (await readWorkingRevisionsMap(db, [caseRow.id])).get(caseRow.id) ?? null,
  }),
  recommendation: async (db, caseRow) => ({
    found: true,
    value:
      (await readCurrentRecommendationsMap(db, [caseRow.id])).get(caseRow.id)?.recommendation ??
      null,
  }),
  recommendation_change: async (db, caseRow, input) =>
    optionalResult(await readRecommendationChangePayload(db, caseRow.id, input.revision ?? -1)),
};

const resolveApplicationSection = async (
  db: Database,
  caseRow: typeof applicationCases.$inferSelect,
  input: ApplicationContentInput,
): Promise<{ found: boolean; value?: unknown }> => {
  const reader = sectionReaders[input.section];
  return reader ? reader(db, caseRow, input) : { found: false };
};

export const readApplicationContent = async (
  db: Database,
  actor: string,
  input: ApplicationContentInput,
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  if (input.section === "intake_change") {
    return readIntakeOrPreparationChange(
      db,
      actor,
      { ...input, recordId: input.applicationId, revision: input.revision ?? -1 },
      "intake",
    );
  }
  const [authorized] = await db
    .select({ caseRow: applicationCases })
    .from(applicationCases)
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(eq(applicationCases.id, input.applicationId));
  if (!authorized) {
    return undefined;
  }

  const resolved = await resolveApplicationSection(db, authorized.caseRow, input);
  if (!resolved.found) {
    return undefined;
  }
  return sliceJsonValue(resolved.value, input.offset, input.length);
};

export const readGrantHistory = (
  db: Database,
  actor: string,
  input: {
    workspaceSlug: string;
    roundId?: string;
    applicationId?: string;
    history: "preparation" | "intake" | "recommendation";
    afterRevision?: number;
    limit: number;
  },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  // History remains available after an eligible record is deleted. Workspace
  // authorization is joined to the history owner's organization on every call.
  const history = auditEvents;
  if (input.history === "recommendation") {
    return db
      .select({
        revision: recommendationVersions.revision,
        action: sql<string>`'recommendation'`,
        recordedAt: recommendationVersions.recordedAt,
      })
      .from(recommendationVersions)
      .innerJoin(applicationCases, eq(applicationCases.id, recommendationVersions.caseId))
      .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
      .where(
        and(
          eq(applicationCases.id, input.applicationId!),
          input.afterRevision === undefined
            ? undefined
            : gt(recommendationVersions.revision, input.afterRevision),
        ),
      )
      .orderBy(recommendationVersions.revision)
      .limit(input.limit + 1);
  }
  return db
    .select({
      revision: sql<number>`${history.targetRevision}`,
      action: history.action,
      recordedAt: history.recordedAt,
    })
    .from(history)
    .innerJoin(workspace, eq(workspace.id, history.organizationId))
    .where(
      and(
        eq(history.targetId, (input.roundId ?? input.applicationId)!),
        eq(history.targetType, input.history === "preparation" ? "round" : "application"),
        input.afterRevision === undefined
          ? undefined
          : gt(history.targetRevision, input.afterRevision),
      ),
    )
    .orderBy(history.targetRevision)
    .limit(input.limit + 1);
};

type SelectedReviewTarget = {
  caseId: string;
  roundId: string;
  applicationVersion: number;
  reviewRevision: number;
  criteriaVersion: number;
};

const readSelectedReviewTarget = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; applicationId: string },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  const [selected] = await db
    .select({
      caseId: applicationCases.id,
      roundId: fundingRounds.id,
      applicationVersion: applicationCases.materialVersion,
      reviewRevision,
      criteriaVersion: fundingRounds.criteriaVersion,
    })
    .from(applicationCases)
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(eq(applicationCases.id, input.applicationId));
  return selected;
};

const readReviewSummaryInputs = async (db: Database, selected: SelectedReviewTarget) => {
  const [assessmentRows, versionRows, requestRows, assignmentRows] = await Promise.all([
    db.select().from(assessments).where(eq(assessments.caseId, selected.caseId)),
    db
      .select({
        assessmentId: assessmentVersions.assessmentId,
        applicationVersion: assessmentVersions.applicationVersion,
        criteriaRoundPublicId: assessmentVersions.criteriaRoundPublicId,
        criteriaVersion: assessmentVersions.criteriaVersion,
      })
      .from(assessmentVersions)
      .where(eq(assessmentVersions.caseId, selected.caseId))
      .orderBy(desc(assessmentVersions.version)),
    db
      .select()
      .from(reviewRequests)
      .where(
        and(eq(reviewRequests.caseId, selected.caseId), eq(reviewRequests.status, "outstanding")),
      ),
    db
      .select({
        requestId: reviewAssignments.requestId,
        assessmentId: reviewAssignments.assessmentId,
        status: reviewAssignments.status,
        conflict: reviewAssignments.conflict,
      })
      .from(reviewAssignments)
      .where(eq(reviewAssignments.caseId, selected.caseId)),
  ]);

  const supersededIds = new Set(
    assessmentRows.flatMap((row) => (row.previousId ? [row.previousId] : [])),
  );
  const latestVersionByAssessment = new Map<string, (typeof versionRows)[number]>();
  for (const version of versionRows) {
    if (!latestVersionByAssessment.has(version.assessmentId)) {
      latestVersionByAssessment.set(version.assessmentId, version);
    }
  }
  const activeAssessments = assessmentRows.filter((row) => !supersededIds.has(row.id));
  const criteriaPairs: { roundId: string; version: number }[] = [
    { roundId: selected.roundId, version: selected.criteriaVersion },
    ...activeAssessments.flatMap((row) => {
      const v = latestVersionByAssessment.get(row.id);
      return v && v.criteriaRoundPublicId !== null && v.criteriaVersion !== null
        ? [{ roundId: v.criteriaRoundPublicId, version: v.criteriaVersion }]
        : [];
    }),
    ...requestRows.map((req) => ({
      roundId: req.criteriaRoundPublicId,
      version: req.criteriaVersion,
    })),
  ];
  const criteriaMap = await readCriteriaByVersionsMap(db, criteriaPairs);
  return { activeAssessments, latestVersionByAssessment, requestRows, assignmentRows, criteriaMap };
};

const formatParticipation = (assignment?: { status: string; conflict: string }) =>
  assignment
    ? {
        participation: {
          status: assignment.status,
          conflict: assignment.conflict !== "",
        },
      }
    : {};

const buildReviewSummaryEntries = (
  selected: SelectedReviewTarget,
  data: Awaited<ReturnType<typeof readReviewSummaryInputs>>,
) => {
  const { activeAssessments, latestVersionByAssessment, requestRows, assignmentRows, criteriaMap } =
    data;
  const assignmentByAssessment = new Map(
    assignmentRows.flatMap((a) => (a.assessmentId ? [[a.assessmentId, a] as const] : [])),
  );
  const assignmentByRequest = new Map(assignmentRows.map((a) => [a.requestId, a] as const));
  const currentCriteria =
    criteriaMap.get(criteriaVersionKey(selected.roundId, selected.criteriaVersion)) ?? null;

  return [
    ...activeAssessments.flatMap((row) => {
      const v = latestVersionByAssessment.get(row.id);
      if (!v) {
        return [];
      }
      return [
        {
          id: row.id,
          kind: "assessment" as const,
          contactId: row.contactId,
          reviewer: row.reviewer,
          applicationVersion: selected.applicationVersion,
          criteriaVersion: selected.criteriaVersion,
          reviewRevision: selected.reviewRevision,
          recordedApplicationVersion: v.applicationVersion,
          recordedCriteriaVersion: v.criteriaVersion,
          recordedCriteria:
            v.criteriaRoundPublicId !== null && v.criteriaVersion !== null
              ? (criteriaMap.get(criteriaVersionKey(v.criteriaRoundPublicId, v.criteriaVersion)) ??
                null)
              : null,
          currentCriteria,
          ...(row.authorUserId !== null ? { authorUserId: row.authorUserId } : {}),
          ...formatParticipation(assignmentByAssessment.get(row.id)),
        },
      ];
    }),
    ...requestRows.map((req) => ({
      id: req.id,
      kind: "request" as const,
      contactId: req.contactId,
      reviewer: req.reviewer,
      applicationVersion: selected.applicationVersion,
      criteriaVersion: selected.criteriaVersion,
      reviewRevision: selected.reviewRevision,
      recordedApplicationVersion: req.applicationVersion,
      recordedCriteriaVersion: req.criteriaVersion,
      recordedCriteria:
        criteriaMap.get(criteriaVersionKey(req.criteriaRoundPublicId, req.criteriaVersion)) ?? [],
      currentCriteria,
      ...formatParticipation(assignmentByRequest.get(req.id)),
    })),
  ];
};

export const readReviewSummaries = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; applicationId: string; after?: string; limit: number },
) => {
  const selected = await readSelectedReviewTarget(db, actor, input);
  if (!selected) {
    return [];
  }
  const entries = buildReviewSummaryEntries(selected, await readReviewSummaryInputs(db, selected));
  const after = input.after ?? "";
  return entries
    .filter((entry) => `${entry.kind}:${entry.id}` > after)
    .sort((left, right) => {
      const leftKey = `${left.kind}:${left.id}`;
      const rightKey = `${right.kind}:${right.id}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .slice(0, input.limit + 1);
};
