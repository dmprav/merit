import { sql, type SQLWrapper } from "drizzle-orm";

import type { Database } from "@merit/db";
import { criteriaVersionKey, readCriteriaByVersionsMap } from "@merit/rounds/scope";

import { reviewAssignments } from "./reviewer-schema";
import { assessments, assessmentVersions, reviewRequests } from "./schema";

// A replacement excludes the old assessment even when it falls outside the requested page.
const unreplaced = sql`not exists (select 1 from ${assessments} replacement
  where replacement.case_id = a.case_id and replacement.previous_id = a.id)`;

const hasVersion = sql`exists (select 1 from ${assessmentVersions} v
  where v.case_id = a.case_id and v.assessment_id = a.id)`;

/** Check membership without computing freshness or comparing historical criteria. */
export const reviewAssignmentMatch = (caseId: SQLWrapper, filter: "awaiting" | "unassigned") => {
  const outstanding = sql`exists (select 1 from ${reviewRequests} r
    where r.case_id = ${caseId} and r.status = 'outstanding')`;
  if (filter === "awaiting") {
    return outstanding;
  }
  return sql`not ${outstanding} and not exists (select 1 from ${assessments} a
    where a.case_id = ${caseId} and ${unreplaced} and ${hasVersion})`;
};

const afterReview = (kind: "assessment" | "request", id: SQLWrapper, after?: string) => {
  if (!after) {
    return sql`true`;
  }

  const [cursorKind, cursorId] = after.split(":");
  return kind === cursorKind ? sql`${id} > ${cursorId}` : sql`${kind === "request"}`;
};

type ReviewPage = { after?: string; limit: number };

export const currentReviewEntries = (caseId: SQLWrapper, page?: ReviewPage) => sql`(
  select a.id, a.contact_id, a.reviewer, a.author_user_id,
    v.version as assessment_version, v.material_version, v.criteria_round_id, v.criteria_version, false as outstanding
  from (
    select id, contact_id, reviewer, author_user_id, case_id from ${assessments} a
    where a.case_id = ${caseId} and ${unreplaced}
    ${
      page
        ? sql`and ${hasVersion} and ${afterReview("assessment", sql`a.id`, page.after)}
      order by a.id limit ${page.limit + 1}`
        : sql.empty()
    }
  ) a
  join lateral (
    select version, material_version, criteria_round_id, criteria_version from ${assessmentVersions}
    where case_id = a.case_id and assessment_id = a.id
    order by version desc limit 1
  ) v on true
  union all
  (select r.id, r.contact_id, r.reviewer, null, null::integer,
    r.material_version, r.criteria_round_id, r.criteria_version, true
   from ${reviewRequests} r where r.case_id = ${caseId} and r.status = 'outstanding'
   ${
     page
       ? sql`and ${afterReview("request", sql`r.id`, page.after)}
     order by r.id limit ${page.limit + 1}`
       : sql.empty()
   })
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
  page: ReviewPage,
) => {
  const entries = await db.execute<{
    id: string;
    outstanding: boolean;
    assessment_version: number | null;
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
      select basis.*
      from ${currentReviewEntries(sql`${target.caseId}`, page)}
      order by basis.outstanding, basis.id
      limit ${page.limit + 1}
    ) page
    left join lateral (
      select status, conflict <> '' as conflict
      from ${reviewAssignments}
      where case_id = ${target.caseId} and
        case when page.outstanding then request_id else assessment_id end = page.id
      order by id limit 1
    ) participation on true
    order by page.outstanding, page.id
  `);
  if (entries.rows.length === 0) {
    return [];
  }
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
      assessmentVersion: row.assessment_version,
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
