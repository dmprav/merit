import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import type { Database, Transaction } from "@merit/db";
import { criteriaVersions, criteriaVersionItems, fundingRounds } from "@merit/rounds/schema";

import { currentReviewEntries } from "./summary-entries";

// Matches sameCriteria: ordered titles and descriptions, ignoring IDs and version numbers.
const criteriaContent = (round: SQLWrapper, version: SQLWrapper) => sql`(
  select coalesce(jsonb_agg(jsonb_build_array(i.title, coalesce(i.description, '')) order by i.position), '[]'::jsonb)
  from ${criteriaVersionItems} i where i.round_id = ${round} and i.version = ${version}
)`;

const knownCriteria = (round: SQLWrapper, version: SQLWrapper) => sql`exists (
  select 1 from ${criteriaVersions} c where c.round_id = ${round} and c.version = ${version}
)`;

const reviewStatuses = (
  caseId: SQLWrapper,
  materialVersion: SQLWrapper,
  roundId: SQLWrapper,
  criteriaVersion: SQLWrapper,
) => {
  const current = criteriaContent(roundId, criteriaVersion);
  const recorded = criteriaContent(sql`basis.criteria_round_id`, sql`basis.criteria_version`);
  const known = knownCriteria(sql`basis.criteria_round_id`, sql`basis.criteria_version`);
  return sql`(
      select basis.id, basis.assessment_version, case
        when basis.outstanding then 'outstanding'
        when basis.material_version <> ${materialVersion} or (${known} and ${recorded} <> ${current}) then 'outdated'
        when basis.material_version is null or not ${known} then 'unknown'
        else 'current'
      end as status, (${known} and ${recorded} <> ${current}) as criteria_changed,
        ${known} as known_criteria, basis.outstanding
      from ${currentReviewEntries(caseId)}
    ) statuses`;
};

/** Check the selected version under the caller's round and case locks. */
export const isCurrentAssessment = async (
  tx: Transaction,
  caseId: string,
  expected: { id: string; version: number },
) => {
  const [match] = await tx
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .innerJoin(fundingRounds, eq(fundingRounds.id, applicationCases.roundId))
    .where(
      and(
        eq(applicationCases.id, caseId),
        sql`exists (select 1 from ${reviewStatuses(
          applicationCases.id,
          applicationCases.materialVersion,
          fundingRounds.id,
          fundingRounds.criteriaVersion,
        )} where statuses.id = ${expected.id} and statuses.assessment_version = ${expected.version} and statuses.status = 'current')`,
      ),
    );
  return match !== undefined;
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
    .from(reviewStatuses(caseId, materialVersion, roundId, criteriaVersion))
    .as("review_overview");
};
