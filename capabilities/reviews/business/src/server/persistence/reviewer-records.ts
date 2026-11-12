import { and, eq, sql, desc, or, inArray } from "drizzle-orm";

import { accessScope } from "@merit/access/scope";
import { decodeApplicationMaterial } from "@merit/applications/encoding";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { organizations, memberships } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { reviewCriteriaSchema } from "@merit/rounds/domain";
import { fundingRounds, criteriaVersions } from "@merit/rounds/schema";
import { currentCriteria } from "@merit/rounds/scope";

import { reviewerDraftSchema } from "../../domain/reviewer";
import { reviewStateSchema } from "../../domain/reviews";
import { assessmentRecord } from "./projections";
import { reviewAssignments, reviewerDrafts, reviewerEvents } from "./reviewer-schema";
import { reviewRequests, assessments } from "./schema";

const reviewerRecordQuery = (db: Database) =>
  db
    .select({
      assignment: reviewAssignments,
      reviewer: reviewRequests.reviewer,
      applicationVersion: reviewRequests.applicationVersion,
      criteriaVersion: reviewRequests.criteriaVersion,
      criteriaRoundId: reviewRequests.criteriaRoundPublicId,
      title: sql<string>`${materialVersions.content}->>'title'`,
      applicant: sql<string>`coalesce(${materialVersions.content}->'submission'->>'organization', '')`,
      currentVersion: applicationCases.materialVersion,
      currentCriteriaVersion: fundingRounds.criteriaVersion,
      currentCriteria,
      criteria: criteriaVersions.criteria,
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
    .leftJoin(
      criteriaVersions,
      and(
        eq(criteriaVersions.roundPublicId, reviewRequests.criteriaRoundPublicId),
        eq(criteriaVersions.version, reviewRequests.criteriaVersion),
      ),
    )
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, reviewAssignments.caseId),
        eq(materialVersions.version, reviewRequests.applicationVersion),
      ),
    );

export const readReviewerRecord = async (db: Database, id: string) =>
  (await reviewerRecordQuery(db).where(eq(reviewAssignments.id, id)))[0];

export type ReviewerRecord = NonNullable<Awaited<ReturnType<typeof readReviewerRecord>>>;

export const activeReviewer = async (db: Database, userId: string, lock = false) => {
  const query = db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.active, true)));
  return (await (lock ? query.for("share") : query))[0];
};

export const reviewerOwns = (record: ReviewerRecord, userId: string, emails: string[]) =>
  record.assignment.reviewerUserId !== null
    ? record.assignment.reviewerUserId === userId
    : emails.some((email) => email.toLowerCase() === record.assignment.email);

const currentMembership = sql<boolean>`(${reviewAssignments.membershipId} is null OR EXISTS (SELECT 1 FROM ${memberships} WHERE ${memberships.id} = ${reviewAssignments.membershipId} AND ${memberships.userId} = ${reviewAssignments.reviewerUserId} AND ${memberships.organizationId} = ${reviewAssignments.organizationId}))`;

export const reviewerIdentityCurrent = async (db: Database, id: string) =>
  Boolean(
    (
      await db
        .select({ id: reviewAssignments.id })
        .from(reviewAssignments)
        .where(and(eq(reviewAssignments.id, id), currentMembership))
    )[0],
  );

export const permittedReviewerWork = async (db: Database, assignmentId: string, userId: string) => {
  const [row] = await db
    .select({ id: reviewAssignments.id })
    .from(reviewAssignments)
    .innerJoin(appUsers, eq(appUsers.id, userId))
    .where(
      and(
        eq(reviewAssignments.id, assignmentId),
        accessScope("work_on_review", {
          "subject.userId": appUsers.id,
          "subject.active": appUsers.active,
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
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
  )[0]?.id ?? null;

export const listReviewerRecords = (db: Database, userId: string, emails: string[]) =>
  reviewerRecordQuery(db)
    .where(
      and(
        currentMembership,
        or(
          eq(reviewAssignments.reviewerUserId, userId),
          and(
            sql`${reviewAssignments.reviewerUserId} is null`,
            inArray(reviewAssignments.email, emails),
          ),
        ),
      ),
    )
    .orderBy(desc(reviewAssignments.createdAt));

export const listManagerReviewerRecords = (
  db: Database,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) =>
  reviewerRecordQuery(db)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, input.workspaceSlug),
        eq(reviewAssignments.caseId, input.publicId),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    )
    .orderBy(reviewAssignments.createdAt);

export const reviewerHistory = (db: Database, id: string) =>
  db
    .select({
      action: reviewerEvents.action,
      actor: reviewerEvents.actorName,
      at: reviewerEvents.recordedAt,
      note: reviewerEvents.note,
    })
    .from(reviewerEvents)
    .where(eq(reviewerEvents.assignmentId, id))
    .orderBy(reviewerEvents.recordedAt);

export const readPrivateReviewerDraft = async (db: Database, id: string) => {
  const [row] = await db.select().from(reviewerDrafts).where(eq(reviewerDrafts.assignmentId, id));
  return row ? { ...row, content: reviewerDraftSchema.parse(row.content) } : undefined;
};

export const readReviewerEvidence = async (db: Database, record: ReviewerRecord) => {
  const [material] = await db
    .select({ content: materialVersions.content })
    .from(materialVersions)
    .where(
      and(
        eq(materialVersions.caseId, record.assignment.caseId),
        eq(materialVersions.version, record.applicationVersion!),
      ),
    );
  const [criteria] = await db
    .select({ content: criteriaVersions.criteria })
    .from(criteriaVersions)
    .where(
      and(
        eq(criteriaVersions.roundPublicId, record.criteriaRoundId!),
        eq(criteriaVersions.version, record.criteriaVersion!),
      ),
    );
  return {
    material: decodeApplicationMaterial(material?.content),
    criteria: reviewCriteriaSchema.parse(criteria?.content),
  };
};

export const readReviewerAssessment = async (db: Database, record: ReviewerRecord) => {
  if (!record.assignment.assessmentId) {
    return null;
  }
  const [row] = await db
    .select({ value: sql<unknown>`${assessmentRecord}` })
    .from(assessments)
    .where(
      and(
        eq(assessments.caseId, record.assignment.caseId),
        eq(assessments.id, record.assignment.assessmentId),
      ),
    );
  return row ? reviewStateSchema.shape.assessments.element.parse(row.value) : null;
};
