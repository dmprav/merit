import { and, eq, gt, sql, type SQL } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import {
  applicationDetails,
  currentMaterial,
  currentSubmission,
  workingRevision,
} from "@merit/applications/scope";
import { auditEvents } from "@merit/audit/schema";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { recommendationVersions } from "@merit/recommendations/schema";
import { recommendationRevision } from "@merit/recommendations/scope";
import { currentRecommendation } from "@merit/recommendations/scope";
import { reviewAssignments } from "@merit/reviews/participation-schema";
import { reviewRequests, assessments, assessmentVersions } from "@merit/reviews/schema";
import { reviewRevision } from "@merit/reviews/scope";
import { assessmentRecord, currentReviews, reviewRequestRecord } from "@merit/reviews/scope";
import { criteriaVersions, fundingRounds } from "@merit/rounds/schema";
import { managerNeedsReassignment } from "@merit/rounds/scope";
import { criteriaHistory, currentCriteria, roundRecord } from "@merit/rounds/scope";

import { moneyData } from "../projections";

const roundFields = {
  roundId: fundingRounds.id,
  title: fundingRounds.title,
  preparationRevision: fundingRounds.revision,
  criteriaVersion: fundingRounds.criteriaVersion,
  budget: moneyData(sql`${fundingRounds.budget}`),
  applicationCount: sql<number>`(select count(*)::integer from ${applicationCases} a where a.organization_id = ${fundingRounds.organizationId} and a.round_id = ${fundingRounds.id})`,
};
const applicationFields = {
  applicationId: applicationCases.id,
  roundId: fundingRounds.id,
  title: sql<string>`(${currentMaterial})->>'title'`,
  applicationVersion: applicationCases.materialVersion,
  intakeRevision: applicationCases.revision,
  reviewRevision: reviewRevision,
  recommendationRevision: recommendationRevision,
  intakeStatus: applicationCases.intakeStatus,
  requested: sql<unknown>`(${currentMaterial})->'requested'`,
  contactId: applicationCases.contactId,
  hasWorkingRevision: sql<boolean>`${workingRevision} is not null`,
};

const roundQuery = (db: Database) =>
  db
    .select(roundFields)
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId));

const access = (actor: string, slug: string) =>
  and(eq(organizations.slug, slug), organizationScope(actor, "work_on_grants", organizations.id));

export const readGrantWorkspaceAccess = async (db: Database, actor: string, slug: string) => {
  const [row] = await db
    .select({
      organizationId: organizations.id,
      allowed: sql<boolean>`${organizationScope(actor, "work_on_grants", organizations.id)}`,
    })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, slug),
        organizationScope(actor, "read_workspace", organizations.id),
      ),
    );
  return row;
};

export const readRoundSummaries = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number },
) =>
  roundQuery(db)
    .where(
      and(
        access(actor, input.workspaceSlug),
        input.after ? gt(fundingRounds.id, input.after) : undefined,
      ),
    )
    .orderBy(fundingRounds.id)
    .limit(input.limit + 1);

export const readRoundIdentity = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; roundId: string },
) => {
  const [row] = await db
    .select({ roundId: fundingRounds.id })
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(access(actor, input.workspaceSlug), eq(fundingRounds.id, input.roundId)));
  return row;
};

export const readRoundOverview = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; roundId: string },
) => {
  const [row] = await db
    .select({
      ...roundFields,
      managerUserId: fundingRounds.managerUserId,
      managerNeedsReassignment,
      requested: sql<string>`(select coalesce(sum((m.content->'requested'->>'minorUnits')::numeric), 0)::text from ${applicationCases} a join ${materialVersions} m on m.case_id = a.id and m.version = a.material_version where a.organization_id = ${fundingRounds.organizationId} and a.round_id = ${fundingRounds.id})`,
      unknownRequests: sql<number>`(select count(*)::integer from ${applicationCases} a left join ${materialVersions} m on m.case_id = a.id and m.version = a.material_version where a.organization_id = ${fundingRounds.organizationId} and a.round_id = ${fundingRounds.id} and (m.content->'requested' is null or m.content->'requested' = 'null'::jsonb))`,
      proposed: sql<string>`(select coalesce(sum((r.content->'allocation'->>'minorUnits')::numeric), 0)::text from ${applicationCases} a join ${recommendationVersions} r on r.case_id = a.id and r.revision = (select max(v.revision) from ${recommendationVersions} v where v.case_id = a.id) where a.organization_id = ${fundingRounds.organizationId} and a.round_id = ${fundingRounds.id})`,
    })
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(access(actor, input.workspaceSlug), eq(fundingRounds.id, input.roundId)));
  return row;
};

export const readApplicationSummaries = (
  db: Database,
  actor: string,
  input: {
    workspaceSlug: string;
    roundId?: string;
    contactId?: string;
    after?: string;
    limit: number;
  },
) =>
  db
    .select(applicationFields)
    .from(applicationCases)
    .leftJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        access(actor, input.workspaceSlug),
        input.roundId ? eq(fundingRounds.id, input.roundId) : undefined,
        input.contactId
          ? sql`(${applicationCases.contactId} = ${input.contactId} or exists (select 1 from ${reviewRequests} where ${reviewRequests.caseId} = ${applicationCases.id} and ${reviewRequests.contactId} = ${input.contactId}) or exists (select 1 from ${assessments} where ${assessments.caseId} = ${applicationCases.id} and ${assessments.contactId} = ${input.contactId}))`
          : undefined,
        input.after ? gt(applicationCases.id, input.after) : undefined,
      ),
    )
    .orderBy(applicationCases.id)
    .limit(input.limit + 1);

export const readApplicationContext = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; applicationId: string },
) => {
  const [row] = await db
    .select({
      ...applicationFields,
      criteriaVersion: fundingRounds.criteriaVersion,
      roundPreparationRevision: fundingRounds.revision,
      lastIntakeRevision: applicationCases.revision,
      lastRecommendationRevision: recommendationRevision,
    })
    .from(applicationCases)
    .leftJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(access(actor, input.workspaceSlug), eq(applicationCases.id, input.applicationId)));
  return row;
};

// SQL slices content before it crosses the database/Worker boundary. A fingerprint
// binds every subsequent chunk to the same source value, including historical edits.
const chunkFields = (source: SQL, offset: number, length: number) => ({
  content: sql<
    string | null
  >`substring((${source})::text from ${offset + 1}::integer for ${length}::integer)`,
  fingerprint: sql<string | null>`md5((${source})::text)`,
  totalCharacters: sql<number | null>`char_length((${source})::text)`,
});

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
  const table = auditEvents;
  const source = sql`jsonb_build_object('revision', ${table.targetRevision}, 'action', ${table.action}, 'reason', ${table.details}->'reason', 'actorUserId', ${table.actorUserId}, 'actorName', ${table.actorName}, 'formatVersion', ${table.formatVersion}, 'provenance', ${table.provenance}, 'recordedAt', ${table.recordedAt}, 'before', ${table.details}->'before', 'after', ${table.details}->'after')`;
  const [row] = await db
    .select(chunkFields(source, input.offset, input.length))
    .from(table)
    .innerJoin(organizations, eq(organizations.id, table.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        access(actor, input.workspaceSlug),
        eq(table.targetId, input.recordId),
        eq(table.targetType, kind === "intake" ? "application" : "round"),
        eq(table.targetRevision, input.revision),
      ),
    );
  return row;
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
  if (input.section === "preparation_change") {
    return readIntakeOrPreparationChange(
      db,
      actor,
      { ...input, recordId: input.roundId, revision: input.revision ?? -1 },
      "preparation",
    );
  }
  const sources = {
    details: sql`${roundRecord} - 'criteria' - 'criteriaVersion' - 'criteriaHistory'`,
    criteria: currentCriteria,
    criteria_history: criteriaHistory,
  };
  const [row] = await db
    .select(chunkFields(sources[input.section], input.offset, input.length))
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(access(actor, input.workspaceSlug), eq(fundingRounds.id, input.roundId)));
  return row;
};

export const readApplicationContent = async (
  db: Database,
  actor: string,
  input: {
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
  },
) => {
  if (input.section === "intake_change") {
    return readIntakeOrPreparationChange(
      db,
      actor,
      { ...input, recordId: input.applicationId, revision: input.revision ?? -1 },
      "intake",
    );
  }
  const sources = {
    details: applicationDetails,
    submission: sql`coalesce(${currentSubmission}, 'null'::jsonb)`,
    material: sql`(select jsonb_build_object('version', ${materialVersions.version}, 'content', ${materialVersions.content}, 'source', ${materialVersions.source}, 'changeKind', ${materialVersions.changeKind}, 'reason', ${materialVersions.reason}, 'recordedByUserId', ${materialVersions.recordedByUserId}, 'recordedAt', ${materialVersions.recordedAt}) from ${materialVersions} where ${materialVersions.caseId} = ${applicationCases.id} and ${materialVersions.version} = ${input.materialVersion ?? -1})`,
    evidence: sql`(${currentMaterial})->'evidence'`,
    reviews: currentReviews,
    assessment: sql`(select ${assessmentRecord} from ${assessments} where ${assessments.caseId} = ${applicationCases.id} and ${assessments.id} = ${input.entryId ?? ""})`,
    review_request: sql`(select ${reviewRequestRecord} from ${reviewRequests} where ${reviewRequests.caseId} = ${applicationCases.id} and ${reviewRequests.id} = ${input.entryId ?? ""})`,
    working_revision: sql`coalesce(${workingRevision}, 'null'::jsonb)`,
    recommendation: sql`coalesce(${currentRecommendation}, 'null'::jsonb)`,
    recommendation_change: sql`(select jsonb_build_object('revision', h.revision, 'actorUserId', h.actor_user_id, 'provenance', h.provenance, 'recordedAt', h.recorded_at, 'before', (select previous.content from ${recommendationVersions} previous where previous.case_id = h.case_id and previous.revision < h.revision order by previous.revision desc limit 1), 'after', h.content) from ${recommendationVersions} h where h.case_id = ${applicationCases.id} and h.revision = ${input.revision ?? -1})`,
  };
  const [row] = await db
    .select(chunkFields(sources[input.section], input.offset, input.length))
    .from(applicationCases)
    .leftJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(access(actor, input.workspaceSlug), eq(applicationCases.id, input.applicationId)));
  return row;
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
      .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
      .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(
        and(
          access(actor, input.workspaceSlug),
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
    .innerJoin(organizations, eq(organizations.id, history.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        access(actor, input.workspaceSlug),
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

export const readReviewSummaries = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; applicationId: string; after?: string; limit: number },
) => {
  const result = await db.execute(sql`
    with selected as (
      select ${applicationCases.id} as case_id, ${applicationCases.materialVersion} as material_version,
        ${reviewRevision} as review_revision,
        ${fundingRounds.criteriaVersion} as criteria_version, ${currentCriteria} as criteria
      from ${applicationCases}
      left join ${fundingRounds} on ${fundingRounds.organizationId} = ${applicationCases.organizationId} and ${fundingRounds.id} = ${applicationCases.roundId}
      join ${organizations} on ${organizations.id} = ${applicationCases.organizationId}
      join ${memberships} on ${memberships.organizationId} = ${organizations.id}
      join ${appUsers} on ${appUsers.id} = ${memberships.userId}
      where ${access(actor, input.workspaceSlug)} and ${applicationCases.id} = ${input.applicationId}
    )
    select jsonb_build_object(
      'id', review.id, 'kind', review.kind, 'contactId', review.contact_id, 'reviewer', review.reviewer,
      'applicationVersion', selected.material_version, 'criteriaVersion', selected.criteria_version, 'reviewRevision', selected.review_revision,
      'recordedApplicationVersion', review.application_version, 'recordedCriteriaVersion', review.criteria_version,
      'recordedCriteria', review.criteria, 'currentCriteria', selected.criteria
    ) || case when review.author_user_id is null then '{}'::jsonb else jsonb_build_object('authorUserId', review.author_user_id) end
      || case when review.participation_status is null then '{}'::jsonb else jsonb_build_object('participation', jsonb_build_object('status', review.participation_status, 'conflict', review.conflict <> '')) end as summary
    from selected cross join lateral (
      select a.id, a.contact_id, a.reviewer, 'assessment' as kind, a.author_user_id, assignment.status as participation_status, assignment.conflict,
        v.material_version as application_version, v.criteria_version, c.criteria
      from ${assessments} a
      left join ${reviewAssignments} assignment on assignment.case_id = a.case_id and assignment.assessment_id = a.id
      join lateral (select * from ${assessmentVersions} v where v.case_id = a.case_id and v.assessment_id = a.id order by v.version desc limit 1) v on true
      left join ${criteriaVersions} c on c.round_id = v.criteria_round_id and c.version = v.criteria_version
      where a.case_id = selected.case_id
        and not exists (select 1 from ${assessments} newer where newer.case_id = a.case_id and newer.previous_id = a.id)
      union all
      select r.id, r.contact_id, r.reviewer, 'request' as kind, null::text as author_user_id, assignment.status as participation_status, assignment.conflict,
        r.material_version as application_version, r.criteria_version, c.criteria
      from ${reviewRequests} r
      left join ${reviewAssignments} assignment on assignment.case_id = r.case_id and assignment.request_id = r.id
      left join ${criteriaVersions} c on c.round_id = r.criteria_round_id and c.version = r.criteria_version
      where r.case_id = selected.case_id and r.status = 'outstanding'
    ) review
    where review.kind || ':' || review.id > ${input.after ?? ""}
    order by review.kind || ':' || review.id limit ${input.limit + 1}
  `);
  return result.rows.map((row) => row.summary);
};
