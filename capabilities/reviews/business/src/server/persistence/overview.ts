import { sql, type SQLWrapper } from "drizzle-orm";

import type { Database } from "@merit/db";
import { criteriaVersions, criteriaVersionItems } from "@merit/rounds/schema";

import { assessments, assessmentVersions, reviewRequests } from "./schema";

// Matches sameCriteria: ordered titles and descriptions, ignoring IDs and version numbers.
const criteriaContent = (round: SQLWrapper, version: SQLWrapper) => sql`(
  select coalesce(jsonb_agg(jsonb_build_array(i.title, coalesce(i.description, '')) order by i.position), '[]'::jsonb)
  from ${criteriaVersionItems} i where i.round_id = ${round} and i.version = ${version}
)`;

const knownCriteria = (round: SQLWrapper, version: SQLWrapper) => sql`exists (
  select 1 from ${criteriaVersions} c where c.round_id = ${round} and c.version = ${version}
)`;

/** Bounded summary projection; latest, non-superseded assessments plus outstanding requests.
 * A known difference wins over unknown facts, as in reviewFreshness/assessmentStatus. */
export const reviewOverview = (
  db: Database,
  caseId: SQLWrapper,
  materialVersion: SQLWrapper,
  roundId: SQLWrapper,
  criteriaVersion: SQLWrapper,
) => {
  const current = criteriaContent(roundId, criteriaVersion);
  const recorded = criteriaContent(sql`basis.criteria_round_id`, sql`basis.criteria_version`);
  const known = knownCriteria(sql`basis.criteria_round_id`, sql`basis.criteria_version`);
  return db
    .select({
      current: sql<number>`count(*) filter (where status = 'current')::integer`.as(
        "review_current",
      ),
      outdated: sql<number>`count(*) filter (where status = 'outdated')::integer`.as(
        "review_outdated",
      ),
      outstanding: sql<number>`count(*) filter (where status = 'outstanding')::integer`.as(
        "review_outstanding",
      ),
      unknown: sql<number>`count(*) filter (where status = 'unknown')::integer`.as(
        "review_unknown",
      ),
      criteriaChanged: sql<boolean>`coalesce(bool_or(criteria_changed), false)`.as(
        "criteria_changed",
      ),
      criteriaAssessments:
        sql<number>`count(*) filter (where known_criteria and not outstanding)::integer`.as(
          "criteria_assessments",
        ),
      criteriaRequests:
        sql<number>`count(*) filter (where known_criteria and outstanding)::integer`.as(
          "criteria_requests",
        ),
    })
    .from(sql`(
      select case
        when basis.outstanding then 'outstanding'
        when basis.material_version <> ${materialVersion} or (${known} and ${recorded} <> ${current}) then 'outdated'
        when basis.material_version is null or not ${known} then 'unknown'
        else 'current'
      end as status, (${known} and ${recorded} <> ${current}) as criteria_changed,
        ${known} as known_criteria, basis.outstanding
      from (
        select v.material_version, v.criteria_round_id, v.criteria_version, false as outstanding
        from ${assessments} a
        join lateral (
          select v.material_version, v.criteria_round_id, v.criteria_version
          from ${assessmentVersions} v
          where v.case_id = a.case_id and v.assessment_id = a.id
          order by v.version desc limit 1
        ) v on true
        where a.case_id = ${caseId} and not exists (
          select 1 from ${assessments} replacement
          where replacement.case_id = a.case_id and replacement.previous_id = a.id
        )
        union all
        select r.material_version, r.criteria_round_id, r.criteria_version, true
        from ${reviewRequests} r where r.case_id = ${caseId} and r.status = 'outstanding'
      ) basis
    ) statuses`)
    .as("review_overview");
};
