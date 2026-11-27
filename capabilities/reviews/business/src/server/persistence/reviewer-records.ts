import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { accessScope } from "@merit/access/scope";
import { decodeApplicationMaterial } from "@merit/applications/domain";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import { caseWithdrawn, readMaterialVersionRecord } from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database, Transaction } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { activeOrganization, authorizedWorkspaces } from "@merit/organizations/scope";
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
import {
  reviewAssignments,
  reviewerDraftObservations,
  reviewerDrafts,
  reviewerMessages,
} from "./reviewer-schema";
import { reviewRequests } from "./schema";

const latestMessageOrder = sql`${desc(reviewerMessages.createdAt)}, ${desc(reviewerMessages.id)}`;

export const latestReviewerMessage = async (
  db: Database,
  assignmentId: string,
  kind: "invitation" | "submission",
) =>
  (
    await db
      .select()
      .from(reviewerMessages)
      .where(and(eq(reviewerMessages.assignmentId, assignmentId), eq(reviewerMessages.kind, kind)))
      .orderBy(latestMessageOrder)
      .limit(1)
  )[0];

const selectReviewerRows = (db: Database, reviewerId?: string) =>
  db
    .select({
      assignment: reviewAssignments,
      evidenceAvailable:
        reviewerId === undefined
          ? sql<boolean>`true`
          : sql<boolean>`${inArray(reviewAssignments.id, permittedAssignments(db, reviewerId))}`,
      reviewer: reviewRequests.reviewer,
      applicationVersion: reviewRequests.applicationVersion,
      criteriaVersion: reviewRequests.criteriaVersion,
      criteriaRoundId: reviewRequests.criteriaRoundPublicId,
      title: materialVersions.title,
      applicant: sql<string>`coalesce(${materialVersions.applicantOrganization}, '')`,
      currentVersion: applicationCases.materialVersion,
      withdrawn: caseWithdrawn,
      currentCriteriaVersion: fundingRounds.criteriaVersion,
      organization: organizations.name,
      organizationKind: organizations.kind,
      slug: organizations.slug,
      delivery: sql<
        "pending" | "sent" | "failed"
      >`coalesce((select status from reviewer_messages where assignment_id = ${reviewAssignments.id} and kind = 'invitation' order by ${latestMessageOrder} limit 1), 'pending')`,
      notification: sql<
        "pending" | "sent" | "failed" | null
      >`(select status from reviewer_messages where assignment_id = ${reviewAssignments.id} and kind = 'submission' order by ${latestMessageOrder} limit 1)`,
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
  const pairs = rows
    .filter((row) => row.evidenceAvailable)
    .flatMap((row) => [
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

export const readReviewerRecord = async (db: Database, id: string, reviewerId?: string) =>
  (
    await attachCriteria(
      db,
      await selectReviewerRows(db, reviewerId).where(eq(reviewAssignments.id, id)),
    )
  )[0];

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

const permittedAssignments = (db: Database, userId: string, assignmentId?: string) =>
  db
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
        assignmentId === undefined ? undefined : eq(reviewAssignments.id, assignmentId),
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

export const permittedReviewerWork = async (db: Database, assignmentId: string, userId: string) =>
  (await permittedAssignments(db, userId, assignmentId)).length > 0;

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

export const reviewerWorkspace = async (db: Database, userId: string, slug: string) => {
  const workspace = authorizedWorkspaces(db, userId, "read_workspace", slug);
  return (await db.select({ id: workspace.id }).from(workspace))[0];
};

export const listReviewerRecords = async (db: Database, userId: string, workspaceSlug?: string) => {
  const workspace = authorizedWorkspaces(db, userId, "assess_grants", workspaceSlug);
  const rows = await selectReviewerRows(db, userId)
    .innerJoin(
      workspace,
      and(
        eq(workspace.id, reviewAssignments.organizationId),
        eq(workspace.membershipId, reviewAssignments.membershipId),
      ),
    )
    .where(
      and(
        currentMembership,
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
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants", input.workspaceSlug);
  const rows = await selectReviewerRows(db)
    .innerJoin(workspace, eq(workspace.id, reviewAssignments.organizationId))
    .where(
      and(
        eq(reviewAssignments.caseId, input.publicId),
        input.assignmentId ? eq(reviewAssignments.id, input.assignmentId) : undefined,
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
  };
};

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

type PendingReviewerMessage = {
  messageId: string;
  assignmentId: string;
  kind: "invitation" | "submission";
  /** The member whose access the delivery acts under: the manager for an invitation. */
  userId: string;
};

const noMessage = "00000000-0000-0000-0000-000000000000";

/**
 * Workers discover only identifiers: the newest unfinished message of each kind per assignment,
 * across workspaces, through a privileged function. Reading and sending a message always
 * opens a scoped transaction for the returned user and assignment.
 */
export const listPendingReviewerMessages = async (
  db: Database,
  limit: number,
  after: string = noMessage,
) =>
  (
    await db.execute<PendingReviewerMessage>(
      sql`select * from merit_pending_reviewer_messages(${limit}, ${after})`,
    )
  ).rows;
