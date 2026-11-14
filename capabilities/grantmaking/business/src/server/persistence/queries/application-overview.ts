import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { caseWithdrawn, currentMaterial } from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { currentRecommendation } from "@merit/recommendations/scope";
import { assessments, assessmentVersions, reviewRequests } from "@merit/reviews/schema";
import { criteriaVersions, fundingRounds } from "@merit/rounds/schema";
import { currentCriteria } from "@merit/rounds/scope";

// Only current review bases cross this seam; assessment text and history stay on the case.
const reviewBases = sql<unknown>`(select coalesce(jsonb_agg(basis), '[]'::jsonb) from (
  select jsonb_build_object('submission', jsonb_build_object('applicationVersion', v.material_version), 'criteria', c.criteria) as basis
  from ${assessments} a
  join lateral (select material_version, criteria_round_id, criteria_version from ${assessmentVersions} v
    where v.case_id = a.case_id and v.assessment_id = a.id order by v.version desc limit 1) v on true
  left join ${criteriaVersions} c on c.round_id = v.criteria_round_id and c.version = v.criteria_version
  where a.case_id = ${applicationCases.id}
    and not exists (select 1 from ${assessments} newer where newer.case_id = a.case_id and newer.previous_id = a.id)
  union all
  select jsonb_build_object('submission', null, 'criteria', c.criteria)
  from ${reviewRequests} r
  left join ${criteriaVersions} c on c.round_id = r.criteria_round_id and c.version = r.criteria_version
  where r.case_id = ${applicationCases.id} and r.status = 'outstanding'
) reviews)`;

export const readApplicationOverviews = (db: Database, userId: string, workspaceSlug: string) =>
  db
    .select({
      id: applicationCases.id,
      title: sql<string>`(${currentMaterial})->>'title'`,
      applicant: sql<
        string | null
      >`nullif((${currentMaterial})->'submission'->>'organization', '')`,
      version: applicationCases.materialVersion,
      intakeStatus: applicationCases.intakeStatus,
      withdrawn: caseWithdrawn,
      roundId: fundingRounds.id,
      roundTitle: fundingRounds.title,
      criteria: currentCriteria,
      reviewBases,
      recommendation: sql<unknown>`case when ${currentRecommendation} is null then null else jsonb_build_object(
        'position', (${currentRecommendation})->'position',
        'outdated', coalesce(((${currentRecommendation})->'recorded'->>'applicationVersion')::integer <> ${applicationCases.materialVersion}, false)) end`,
    })
    .from(applicationCases)
    .innerJoin(
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
        eq(organizations.slug, workspaceSlug),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    )
    .orderBy(fundingRounds.title, fundingRounds.id, applicationCases.position, applicationCases.id);
