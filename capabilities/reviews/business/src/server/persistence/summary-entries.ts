import { sql, type SQLWrapper } from "drizzle-orm";

import type { Database } from "@merit/db";
import { criteriaVersionKey, readCriteriaByVersionsMap } from "@merit/rounds/scope";

import { reviewAssignments } from "./reviewer-schema";
import { assessments, assessmentVersions, reviewRequests } from "./schema";

export const currentReviewEntries = (caseId: SQLWrapper) => sql`(
  select a.id, a.contact_id, a.reviewer, a.author_user_id,
    v.material_version, v.criteria_round_id, v.criteria_version, false as outstanding
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
  select r.id, r.contact_id, r.reviewer, null,
    r.material_version, r.criteria_round_id, r.criteria_version, true
  from ${reviewRequests} r where r.case_id = ${caseId} and r.status = 'outstanding'
) basis`;

type ReviewTarget = {
  caseId: string;
  roundId: string;
  applicationVersion: number;
  criteriaVersion: number;
  reviewRevision: number;
};

/** Read manager-visible summary facts for an authorized case in the caller's transaction. */
export const readReviewSummaryPage = async (
  db: Database,
  target: ReviewTarget,
  page: { after?: string; limit: number },
) => {
  const cursor = sql`(case when basis.outstanding then 'request:' else 'assessment:' end || basis.id) collate "C"`;
  const entries = await db.execute<{
    id: string;
    outstanding: boolean;
    contact_id: string;
    reviewer: string;
    author_user_id: string | null;
    material_version: number | null;
    criteria_round_id: string | null;
    criteria_version: number | null;
    status: string | null;
    conflict: boolean | null;
  }>(sql`
    select page.*, participation.status, participation.conflict
    from (
      select basis.*, ${cursor} as cursor
      from ${currentReviewEntries(sql`${target.caseId}`)}
      where ${cursor} > ${page.after ?? ""}
      order by cursor
      limit ${page.limit + 1}
    ) page
    left join lateral (
      select status, conflict <> '' as conflict
      from ${reviewAssignments}
      where case_id = ${target.caseId} and
        case when page.outstanding then request_id else assessment_id end = page.id
      order by id limit 1
    ) participation on true
    order by page.cursor
  `);
  const criteria = await readCriteriaByVersionsMap(db, [
    { roundId: target.roundId, version: target.criteriaVersion },
    ...entries.rows.flatMap((row) =>
      row.criteria_round_id !== null && row.criteria_version !== null
        ? [{ roundId: row.criteria_round_id, version: row.criteria_version }]
        : [],
    ),
  ]);
  const currentCriteria =
    criteria.get(criteriaVersionKey(target.roundId, target.criteriaVersion)) ?? null;
  return entries.rows.map((row) => {
    const recordedCriteria =
      row.criteria_round_id !== null && row.criteria_version !== null
        ? criteria.get(criteriaVersionKey(row.criteria_round_id, row.criteria_version))
        : undefined;
    return {
      id: row.id,
      kind: row.outstanding ? ("request" as const) : ("assessment" as const),
      reviewer: row.reviewer,
      contactId: row.contact_id,
      reviewRevision: target.reviewRevision,
      applicationVersion: target.applicationVersion,
      criteriaVersion: target.criteriaVersion,
      recordedApplicationVersion: row.material_version,
      recordedCriteriaVersion: row.criteria_version,
      recordedCriteria: recordedCriteria ?? (row.outstanding ? [] : null),
      currentCriteria,
      ...(row.author_user_id !== null ? { authorUserId: row.author_user_id } : {}),
      ...(row.status !== null
        ? { participation: { status: row.status, conflict: row.conflict } }
        : {}),
    };
  });
};
