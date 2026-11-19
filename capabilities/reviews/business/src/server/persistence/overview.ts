import { sql, type SQLWrapper } from "drizzle-orm";

import type { Database } from "@merit/db";
import { criteriaVersions, criteriaVersionItems } from "@merit/rounds/schema";

import { reviewAssignments } from "./reviewer-schema";
import { assessments, assessmentVersions, reviewRequests } from "./schema";

// Matches sameCriteria: ordered titles and descriptions, ignoring IDs and version numbers.
const criteriaContent = (round: SQLWrapper, version: SQLWrapper) => sql`(
  select coalesce(jsonb_agg(jsonb_build_array(i.title, coalesce(i.description, '')) order by i.position), '[]'::jsonb)
  from ${criteriaVersionItems} i where i.round_id = ${round} and i.version = ${version}
)`;

const knownCriteria = (round: SQLWrapper, version: SQLWrapper) => sql`exists (
  select 1 from ${criteriaVersions} c where c.round_id = ${round} and c.version = ${version}
)`;

const hasOutstandingReview = (caseId: SQLWrapper) =>
  sql`exists (select 1 from ${reviewRequests} r where r.case_id = ${caseId} and r.status = 'outstanding')`;

// A replacement excludes the old assessment even when it falls outside the requested page.
const unreplaced = sql`not exists (select 1 from ${assessments} replacement
  where replacement.case_id = a.case_id and replacement.previous_id = a.id)`;

const latestBasis = (caseId: SQLWrapper, assessmentId: SQLWrapper) => sql`(
  select material_version, criteria_round_id, criteria_version from ${assessmentVersions}
  where case_id = ${caseId} and assessment_id = ${assessmentId}
  order by version desc limit 1
)`;

const hasVersion = sql`exists (select 1 from ${assessmentVersions} v
  where v.case_id = a.case_id and v.assessment_id = a.id)`;

/** Check membership without computing freshness or comparing historical criteria. */
export const reviewAssignmentMatch = (caseId: SQLWrapper, filter: "awaiting" | "unassigned") => {
  const outstanding = hasOutstandingReview(caseId);
  if (filter === "awaiting") {
    return outstanding;
  }
  return sql`not ${outstanding} and not exists (select 1 from ${assessments} a
    where a.case_id = ${caseId} and ${unreplaced} and ${hasVersion})`;
};

/** Continue legacy and current IDs in their stable kind:id order. */
const afterReview = (kind: "assessment" | "request", id: SQLWrapper, after: string) => {
  const prefix = `${kind}:`;
  return after.startsWith(prefix)
    ? sql`${id} collate "C" > ${after.slice(prefix.length)}`
    : sql`${prefix > after}`;
};

/** Page the same eligible assessments and requests as the overview before loading participation or criteria. */
export const readReviewSummaryPage = async (
  db: Database,
  caseId: string,
  after: string,
  size: number,
) => {
  const result = await db.execute<{
    id: string;
    kind: "request" | "assessment";
    reviewer: string;
    contactId: string;
    authorUserId: string | null;
    recordedApplicationVersion: number | null;
    criteriaRoundId: string | null;
    recordedCriteriaVersion: number | null;
    status: string | null;
    conflict: boolean;
  }>(sql`
    with page as materialized (
      (select 'assessment' as kind, a.id collate "C" as id, a.reviewer, a.contact_id, a.author_user_id,
        null::integer as material_version, null::text as criteria_round_id, null::integer as criteria_version
       from ${assessments} a where a.case_id = ${caseId} and ${unreplaced}
         and ${afterReview("assessment", sql`a.id`, after)}
         and ${hasVersion}
       order by id limit ${size})
      union all
      (select 'request' as kind, r.id collate "C" as id, r.reviewer, r.contact_id, null,
        r.material_version, r.criteria_round_id, r.criteria_version
       from ${reviewRequests} r where r.case_id = ${caseId} and r.status = 'outstanding'
         and ${afterReview("request", sql`r.id`, after)}
       order by id limit ${size})
      order by kind, id limit ${size}
    )
    select p.id, p.kind, p.reviewer, p.contact_id as "contactId", p.author_user_id as "authorUserId",
      coalesce(v.material_version, p.material_version) as "recordedApplicationVersion",
      coalesce(v.criteria_round_id, p.criteria_round_id) as "criteriaRoundId",
      coalesce(v.criteria_version, p.criteria_version) as "recordedCriteriaVersion", a.status, a.conflict <> '' as conflict
    from page p
    left join lateral ${latestBasis(sql`${caseId}`, sql`p.id`)} v on p.kind = 'assessment'
    left join lateral (
      select status, conflict from ${reviewAssignments} a
      where a.case_id = ${caseId} and
        ((p.kind = 'request' and a.request_id = p.id) or (p.kind = 'assessment' and a.assessment_id = p.id))
      order by a.id limit 1
    ) a on true
    order by p.kind collate "C", p.id collate "C"
  `);
  return result.rows;
};

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
        join lateral ${latestBasis(sql`a.case_id`, sql`a.id`)} v on true
        where a.case_id = ${caseId} and ${unreplaced}
        union all
        select r.material_version, r.criteria_round_id, r.criteria_version, true
        from ${reviewRequests} r where r.case_id = ${caseId} and r.status = 'outstanding'
      ) basis
    ) statuses`)
    .as("review_overview");
};
