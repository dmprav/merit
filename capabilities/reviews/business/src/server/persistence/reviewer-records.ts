import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { accessScope } from "@merit/access/scope";
import { decodeApplicationMaterial } from "@merit/applications/domain";
import type { SourceDocumentRole } from "@merit/applications/domain";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import {
  readApplicationDocuments,
  readMaterialVersionRecord,
  readSourceDocumentFile,
} from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { activeOrganization, organizationScope } from "@merit/organizations/scope";
import { reviewCriteriaSchema } from "@merit/rounds/domain";
import { fundingRounds } from "@merit/rounds/schema";
import {
  criteriaVersionKey,
  readCriteriaByVersionsMap,
  type CriterionRecord,
} from "@merit/rounds/scope";

import { reviewerDraftSchema } from "../../domain/reviewer";
import { reviewStateSchema } from "../../domain/reviews";
import { readAssessmentRecord } from "./projections";
import { reviewAssignments, reviewerDraftObservations, reviewerDrafts } from "./reviewer-schema";
import { reviewRequests } from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const selectReviewerRows = (db: Database) =>
  db
    .select({
      assignment: reviewAssignments,
      reviewer: reviewRequests.reviewer,
      applicationVersion: reviewRequests.applicationVersion,
      criteriaVersion: reviewRequests.criteriaVersion,
      criteriaRoundId: reviewRequests.criteriaRoundPublicId,
      title: materialVersions.title,
      applicant: sql<string>`coalesce(${materialVersions.applicantOrganization}, '')`,
      currentVersion: applicationCases.materialVersion,
      currentCriteriaVersion: fundingRounds.criteriaVersion,
      organization: organizations.name,
      slug: organizations.slug,
      delivery: sql<
        "pending" | "sent" | "failed"
      >`coalesce((select status from reviewer_messages where assignment_id = ${reviewAssignments.id} and kind = 'invitation' order by created_at desc, id desc limit 1), 'pending')`,
      notification: sql<
        "pending" | "sent" | "failed" | null
      >`(select status from reviewer_messages where assignment_id = ${reviewAssignments.id} and kind = 'submission' order by created_at desc, id desc limit 1)`,
    })
    .from(reviewAssignments)
    .innerJoin(organizations, eq(organizations.id, reviewAssignments.organizationId))
    .innerJoin(applicationCases, eq(applicationCases.id, reviewAssignments.caseId))
    .innerJoin(fundingRounds, eq(fundingRounds.id, applicationCases.roundId))
    .innerJoin(
      reviewRequests,
      and(
        eq(reviewRequests.caseId, reviewAssignments.caseId),
        eq(reviewRequests.id, reviewAssignments.requestId),
      ),
    )
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, reviewAssignments.caseId),
        eq(materialVersions.version, reviewRequests.applicationVersion),
      ),
    );

type RawReviewerRow = Awaited<ReturnType<typeof selectReviewerRows>>[number];

const attachCriteria = async (db: Database, rows: RawReviewerRow[]) => {
  if (rows.length === 0) {
    return [];
  }
  const pairs = rows.flatMap((row) => [
    { roundId: row.criteriaRoundId, version: row.criteriaVersion },
    { roundId: row.criteriaRoundId, version: row.currentCriteriaVersion },
  ]);
  const criteriaMap: Map<string, CriterionRecord[]> = await readCriteriaByVersionsMap(db, pairs);
  return rows.map((row) => ({
    ...row,
    criteria: criteriaMap.get(criteriaVersionKey(row.criteriaRoundId, row.criteriaVersion)) ?? [],
    currentCriteria:
      criteriaMap.get(criteriaVersionKey(row.criteriaRoundId, row.currentCriteriaVersion)) ?? null,
  }));
};

export const readReviewerRecord = async (db: Database, id: string) =>
  (await attachCriteria(db, await selectReviewerRows(db).where(eq(reviewAssignments.id, id))))[0];

export type ReviewerRecord = NonNullable<Awaited<ReturnType<typeof readReviewerRecord>>>;

export const activeReviewer = async (db: Database, userId: string) =>
  (
    await db
      .select()
      .from(appUsers)
      .where(and(eq(appUsers.id, userId), eq(appUsers.active, true)))
  )[0];

export const lockActiveReviewer = async (tx: Transaction, userId: string) =>
  (
    await tx
      .select()
      .from(appUsers)
      .where(and(eq(appUsers.id, userId), eq(appUsers.active, true)))
      .for("share")
  )[0];

/**
 * An unbound assignment belongs to whoever holds its membership, whose email was verified when
 * they accepted the workspace invitation; callers confirm that with `reviewerIdentityCurrent`.
 */
export const reviewerOwns = (record: ReviewerRecord, userId: string) =>
  record.assignment.reviewerUserId === null || record.assignment.reviewerUserId === userId;

const currentMembership = sql<boolean>`EXISTS (SELECT 1 FROM ${memberships}
  WHERE ${memberships.id} = ${reviewAssignments.membershipId}
    AND (${reviewAssignments.reviewerUserId} IS NULL OR ${memberships.userId} = ${reviewAssignments.reviewerUserId})
    AND ${memberships.organizationId} = ${reviewAssignments.organizationId}
    AND ${memberships.role} IN ('reviewer', 'program_manager'))`;

export const reviewerIdentityCurrent = async (db: Database, id: string, userId: string) =>
  Boolean(
    (
      await db
        .select({ id: reviewAssignments.id })
        .from(reviewAssignments)
        .innerJoin(organizations, eq(organizations.id, reviewAssignments.organizationId))
        .innerJoin(memberships, eq(memberships.id, reviewAssignments.membershipId))
        .where(
          and(
            eq(reviewAssignments.id, id),
            eq(memberships.userId, userId),
            currentMembership,
            activeOrganization,
          ),
        )
    )[0],
  );

export const permittedReviewerWork = async (db: Database, assignmentId: string, userId: string) => {
  const [row] = await db
    .select({ id: reviewAssignments.id })
    .from(reviewAssignments)
    .innerJoin(organizations, eq(organizations.id, reviewAssignments.organizationId))
    .innerJoin(appUsers, eq(appUsers.id, userId))
    .innerJoin(
      memberships,
      and(eq(memberships.organizationId, organizations.id), eq(memberships.userId, userId)),
    )
    .where(
      and(
        eq(reviewAssignments.id, assignmentId),
        activeOrganization,
        accessScope("work_on_review", {
          "subject.userId": appUsers.id,
          "subject.active": appUsers.active,
          "subject.organizationId": memberships.organizationId,
          "subject.role": memberships.role,
          "resource.organizationId": reviewAssignments.organizationId,
          "resource.reviewerUserId": reviewAssignments.reviewerUserId,
          "resource.reviewStatus": reviewAssignments.status,
          "resource.reviewMembershipCurrent": currentMembership,
        }),
      ),
    );
  return Boolean(row);
};

export const reviewerMembership = async (db: Database, organizationId: string, userId: string) =>
  (
    await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, userId),
          inArray(memberships.role, ["reviewer", "program_manager"]),
        ),
      )
  )[0]?.id ?? null;

export const reviewerMembershipByEmail = async (
  db: Database,
  organizationId: string,
  email: string,
) =>
  (
    await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.email, email),
          eq(appUsers.active, true),
          inArray(memberships.role, ["reviewer", "program_manager"]),
        ),
      )
  )[0]?.id ?? null;

/** The member's invitation email, verified when they accepted it; demo memberships have none. */
export const memberEmail = async (db: Database, organizationId: string, userId: string) =>
  (
    await db
      .select({ email: memberships.email })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
  )[0]?.email ?? null;

export const reviewerWorkspace = async (db: Database, userId: string, slug: string) =>
  (
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(
        and(
          eq(organizations.slug, slug),
          organizationScope(userId, "read_workspace", organizations.id),
        ),
      )
  )[0];

export const listReviewerRecords = async (db: Database, userId: string, workspaceSlug?: string) => {
  const rows = await selectReviewerRows(db)
    .innerJoin(
      memberships,
      and(eq(memberships.id, reviewAssignments.membershipId), eq(memberships.userId, userId)),
    )
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        currentMembership,
        organizationScope(userId, "assess_grants", organizations.id),
        workspaceSlug === undefined ? undefined : eq(organizations.slug, workspaceSlug),
        activeOrganization,
        or(
          eq(reviewAssignments.reviewerUserId, userId),
          sql`${reviewAssignments.reviewerUserId} is null`,
        ),
      ),
    )
    .orderBy(desc(reviewAssignments.createdAt));
  return attachCriteria(db, rows);
};

export const listManagerReviewerRecords = async (
  db: Database,
  userId: string,
  input: { workspaceSlug: string; publicId: string; assignmentId?: string },
) => {
  const rows = await selectReviewerRows(db)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, input.workspaceSlug),
        eq(reviewAssignments.caseId, input.publicId),
        input.assignmentId ? eq(reviewAssignments.id, input.assignmentId) : undefined,
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    )
    .orderBy(reviewAssignments.createdAt);
  return attachCriteria(db, rows);
};

export const readPrivateReviewerDraft = async (db: Database, id: string) => {
  const [[row], observationRows] = await Promise.all([
    db.select().from(reviewerDrafts).where(eq(reviewerDrafts.assignmentId, id)),
    db
      .select()
      .from(reviewerDraftObservations)
      .where(eq(reviewerDraftObservations.assignmentId, id))
      .orderBy(asc(reviewerDraftObservations.position)),
  ]);
  if (!row) {
    return undefined;
  }
  return {
    ...row,
    content: reviewerDraftSchema.parse({
      position: row.position,
      amount: row.amount,
      reasoning: row.reasoning,
      observations: observationRows.map((obs) => ({
        criterionId: obs.criterionId,
        criterion: obs.criterion,
        text: obs.text,
      })),
      note: row.note,
    }),
  };
};

export const readReviewerEvidence = async (db: Database, record: ReviewerRecord) => {
  const [materialRecord, criteriaMap] = await Promise.all([
    readMaterialVersionRecord(db, record.assignment.caseId, record.applicationVersion),
    readCriteriaByVersionsMap(db, [
      { roundId: record.criteriaRoundId, version: record.criteriaVersion },
    ]),
  ]);
  const criteria = criteriaMap.get(
    criteriaVersionKey(record.criteriaRoundId, record.criteriaVersion),
  );
  return {
    material: decodeApplicationMaterial(materialRecord?.content),
    criteria: criteria ? reviewCriteriaSchema.parse(criteria) : null,
    documents: await readApplicationDocuments(db, record.assignment.caseId),
  };
};

export const readAssignedDocuments = (db: Database, record: ReviewerRecord) =>
  readApplicationDocuments(db, record.assignment.caseId);

export const readAssignedDocumentFile = (
  db: Database,
  caseId: string,
  role: SourceDocumentRole,
  version: number,
) => readSourceDocumentFile(db, caseId, role, version);

export const readReviewerAssessment = async (db: Database, record: ReviewerRecord) => {
  if (!record.assignment.assessmentId) {
    return null;
  }
  const assessment = await readAssessmentRecord(
    db,
    record.assignment.caseId,
    record.assignment.assessmentId,
  );
  return assessment ? reviewStateSchema.shape.assessments.element.parse(assessment) : null;
};
