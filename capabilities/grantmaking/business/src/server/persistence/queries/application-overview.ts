import { and, asc, desc, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { applicationPhraseMatch, caseWithdrawn } from "@merit/applications/scope";
import type { Database } from "@merit/db";
import { titleOrder } from "@merit/db/search";
import { currentDecisionRecord } from "@merit/decisions/scope";
import { authorizedWorkspaces } from "@merit/organizations/scope";
import {
  candidateRecommendationOverviews,
  recommendationOverview,
} from "@merit/recommendations/scope";
import { reviewAssignmentMatch, reviewOverview } from "@merit/reviews/scope";
import { fundingRounds } from "@merit/rounds/schema";

import type { ApplicationFilter } from "../../../domain/application-filter";
import type { WorkspaceApplicationsQuery } from "../../../domain/application-list";

const overviewRows = (db: Database, workspaceIds: SQLWrapper, input: WorkspaceApplicationsQuery) =>
  db
    .select({
      id: applicationCases.id,
      title: materialVersions.title,
      applicant: sql<string | null>`nullif(${materialVersions.applicantOrganization}, '')`.as(
        "applicant",
      ),
      roundId: applicationCases.roundId,
      roundTitle: sql<string>`${fundingRounds.title}`.as("roundTitle"),
      position: applicationCases.position,
      requestedMinorUnits: materialVersions.requestedMinorUnits,
      requestedCurrency: materialVersions.requestedCurrency,
      intakeStatus: applicationCases.intakeStatus,
      withdrawn: caseWithdrawn.as("withdrawn"),
      version: applicationCases.materialVersion,
      criteriaVersion: fundingRounds.criteriaVersion,
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .where(
      and(
        inArray(applicationCases.organizationId, workspaceIds),
        input.roundId ? eq(applicationCases.roundId, input.roundId) : undefined,
        input.query ? applicationPhraseMatch(input.query) : undefined,
        input.filter.participation
          ? sql`${caseWithdrawn} = ${input.filter.participation === "withdrawn"}`
          : undefined,
        input.filter.readiness
          ? eq(
              applicationCases.intakeStatus,
              input.filter.readiness === "ready" ? "ready" : "in_preparation",
            )
          : undefined,
        input.filter.reviews
          ? reviewAssignmentMatch(applicationCases.id, input.filter.reviews)
          : undefined,
      ),
    )
    .as("b");

type OverviewRow = ReturnType<typeof overviewRows>;

const reviewCounts = (r: ReturnType<typeof reviewOverview>) => sql`jsonb_build_object(
  'current', ${r.current}, 'outdated', ${r.outdated}, 'outstanding', ${r.outstanding}, 'unknown', ${r.unknown})`;

const recommendationRecord = (
  r: ReturnType<typeof recommendationOverview>,
) => sql`case when ${r.position} is not null then jsonb_build_object(
  'position', ${r.position}, 'outdated', ${r.outdated}, 'allocation', jsonb_build_object(
    'minorUnits', ${r.allocationMinorUnits}::text, 'currency', ${r.allocationCurrency})) end`;

const workFilter = (
  filter: ApplicationFilter,
  reviews: ReturnType<typeof reviewOverview>,
  recommendation: ReturnType<typeof recommendationOverview>,
) =>
  and(
    filter.evidence === "changed"
      ? sql`(${reviews.outdated} > 0 or ${reviews.criteriaChanged} or ${recommendation.outdated})`
      : undefined,
    filter.evidence === "unknown" ? sql`${reviews.unknown} > 0` : undefined,
    filter.recommendation === "missing" ? sql`${recommendation.position} is null` : undefined,
  );

const order = (input: WorkspaceApplicationsQuery, row: OverviewRow) => {
  const direction = input.direction === "descending" ? desc : asc;
  const columns = {
    application: titleOrder(sql`${row.title}`),
    applicant: titleOrder(sql`${row.applicant}`),
    round: titleOrder(sql`${row.roundTitle}`),
    requested: row.requestedMinorUnits,
    proposed: sql`b.proposed`,
    intake: sql`case when ${row.withdrawn} then 'Withdrawn' when ${row.intakeStatus} = 'ready' then 'Ready' else 'In preparation' end`,
  };
  return input.sort
    ? sql`${direction(columns[input.sort])} nulls last, ${row.id} asc`
    : sql`${row.roundTitle} asc, ${row.roundId} asc, ${row.position} asc, ${row.id} asc`;
};

export const readApplicationOverviews = async (
  db: Database,
  userId: string,
  input: WorkspaceApplicationsQuery,
  pageSize: number,
) => {
  const access = authorizedWorkspaces(db, userId, "read_workspace", input.workspaceSlug);
  const visible = db.select({ id: access.id, allowed: access.canWorkOnGrants }).from(access);
  const needsReviews = Boolean(input.filter.evidence);
  const needsRecommendation = Boolean(
    input.filter.recommendation || input.filter.evidence === "changed" || input.sort === "proposed",
  );
  const workspaceIds = sql`(select id from workspace_access where allowed)`;
  const row = overviewRows(db, workspaceIds, input);
  const total = db
    .select({ count: sql`count(*)::integer` })
    .from(applicationCases)
    .where(inArray(applicationCases.organizationId, workspaceIds));
  const candidates = sql`candidates b`;
  const candidateRecommendations = candidateRecommendationOverviews(
    db,
    candidates,
    row.id,
    row.version,
  );
  const reviews = reviewOverview(db, row.id, row.version, row.roundId, row.criteriaVersion);
  const recommendation = recommendationOverview(db, row.id, row.version);
  const joinReviews = sql`cross join lateral ${reviews}`;
  const joinRecommendation = sql`left join lateral ${recommendation} on true`;
  const offset = sql`least(${input.offset}, greatest(0, (matching - 1) / ${pageSize}) * ${pageSize})`;
  // Only filters and sorting need facts before pagination. Reuse those facts for display.
  const result = await db.execute<{
    allowed: boolean;
    applications: unknown[];
    total: number;
    matching: number;
    offset: number;
  }>(sql`
    with workspace_access(id, allowed) as materialized (${visible}),
    candidates as (select * from ${row}),
    matched as materialized (
      select b.*
        ${needsReviews ? sql`, ${reviewCounts(reviews)} as reviews, ${reviews.criteriaChanged} as "criteriaChanged"` : sql.empty()}
        ${needsRecommendation ? sql`, ${recommendationRecord(recommendation)} as recommendation, ${recommendation.allocationMinorUnits} as proposed` : sql.empty()}
      from ${candidates}
      ${needsReviews ? joinReviews : sql.empty()}
      ${needsRecommendation ? sql`left join ${candidateRecommendations} on ${candidateRecommendations.caseId} = ${row.id}` : sql.empty()}
      where ${workFilter(input.filter, reviews, recommendation) ?? sql`true`}
    ),
    counts as (select (${total}) as total, count(*)::integer as matching from matched),
    page as materialized (
      select * from matched b order by ${order(input, row)} limit ${pageSize}
      offset (select ${offset} from counts)
    )
    select allowed, total, matching, ${offset} as offset,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ${row.id}, 'title', ${row.title}, 'applicant', ${row.applicant}, 'roundId', ${row.roundId}, 'roundTitle', ${row.roundTitle},
        'intakeStatus', ${row.intakeStatus}, 'withdrawn', ${row.withdrawn},
        'requested', case when ${row.requestedMinorUnits} is not null then jsonb_build_object(
          'minorUnits', ${row.requestedMinorUnits}::text, 'currency', ${row.requestedCurrency}) end,
        'decision', ${currentDecisionRecord(row.id)},
        'recommendation', ${needsRecommendation ? sql`b.recommendation` : recommendationRecord(recommendation)},
        'reviews', ${needsReviews ? sql`b.reviews` : reviewCounts(reviews)},
        'criteriaChanged', ${needsReviews ? sql`b."criteriaChanged"` : reviews.criteriaChanged}
      ) order by ${order(input, row)}), '[]'::jsonb) from page b
      ${needsReviews ? sql.empty() : joinReviews}
      ${needsRecommendation ? sql.empty() : joinRecommendation}) as applications
    from counts cross join workspace_access
  `);
  return result.rows[0];
};
