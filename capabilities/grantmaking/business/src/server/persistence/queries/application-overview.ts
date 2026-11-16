import { and, asc, desc, eq, sql } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { caseWithdrawn } from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { titleOrder } from "@merit/db/search";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { recommendationVersions } from "@merit/recommendations/schema";
import { reviewOverview } from "@merit/reviews/scope";
import { fundingRounds } from "@merit/rounds/schema";

import type { ApplicationFilter } from "../../../domain/application-filter";
import type { WorkspaceApplicationsQuery } from "../../../domain/application-list";

const overviewRows = (db: Database, userId: string, workspaceSlug: string) =>
  db
    .select({
      id: applicationCases.id,
      title: materialVersions.title,
      applicant: sql<string | null>`nullif(${materialVersions.applicantOrganization}, '')`.as(
        "applicant",
      ),
      roundId: sql<string>`${fundingRounds.id}`.as("roundId"),
      roundTitle: sql<string>`${fundingRounds.title}`.as("roundTitle"),
      position: applicationCases.position,
      requested: sql`case when ${materialVersions.requestedMinorUnits} is null then null else
        jsonb_build_object('minorUnits', ${materialVersions.requestedMinorUnits}::text, 'currency', 'EUR') end`.as(
        "requested",
      ),
      intakeStatus: sql<string>`${applicationCases.intakeStatus}`.as("intakeStatus"),
      withdrawn: caseWithdrawn.as("withdrawn"),
      version: sql<number>`${applicationCases.materialVersion}`.as("version"),
      criteriaVersion: sql<number>`${fundingRounds.criteriaVersion}`.as("criteriaVersion"),
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
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, workspaceSlug),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    );

const reviewsFor = (alias: "b" | "p") => {
  const row = sql.identifier(alias);
  return reviewOverview(
    sql`${row}.id`,
    sql`${row}.version`,
    sql`${row}."roundId"`,
    sql`${row}."criteriaVersion"`,
  );
};

const recommendationFor = (alias: "b" | "p") => {
  const row = sql.identifier(alias);
  return sql`(select jsonb_build_object('position', r.position, 'outdated',
    r.recorded_date is not null and r.material_version is not null and r.material_version <> ${row}.version,
    'allocation', jsonb_build_object('minorUnits', r.allocation_minor_units::text, 'currency', r.allocation_currency))
    from ${recommendationVersions} r where r.case_id = ${row}.id order by r.revision desc limit 1)`;
};

const workFilter = (filter: ApplicationFilter) =>
  and(
    filter.participation ? sql`withdrawn = ${filter.participation === "withdrawn"}` : undefined,
    filter.readiness
      ? sql`"intakeStatus" = ${filter.readiness === "ready" ? "ready" : "in_preparation"}`
      : undefined,
    filter.reviews === "awaiting" ? sql`(review_summary->>'outstanding')::integer > 0` : undefined,
    filter.reviews === "unassigned"
      ? sql`(review_summary->>'current')::integer + (review_summary->>'outdated')::integer + (review_summary->>'outstanding')::integer + (review_summary->>'unknown')::integer = 0`
      : undefined,
    filter.evidence === "changed"
      ? sql`((review_summary->>'outdated')::integer > 0 or (review_summary->>'criteriaChanged')::boolean or coalesce((recommendation->>'outdated')::boolean, false))`
      : undefined,
    filter.evidence === "unknown" ? sql`(review_summary->>'unknown')::integer > 0` : undefined,
    filter.recommendation === "missing" ? sql`recommendation is null` : undefined,
  ) ?? sql`true`;

const order = (input: WorkspaceApplicationsQuery) => {
  const direction = input.direction === "descending" ? desc : asc;
  const columns = {
    application: titleOrder(sql`title`),
    applicant: titleOrder(sql`applicant`),
    round: titleOrder(sql`"roundTitle"`),
    requested: sql`(requested->>'minorUnits')::numeric`,
    proposed: sql`(recommendation->'allocation'->>'minorUnits')::numeric`,
    intake: sql`case when withdrawn then 'Withdrawn' when "intakeStatus" = 'ready' then 'Ready' else 'In preparation' end`,
  };
  return input.sort
    ? sql`${direction(columns[input.sort])} nulls last, id asc`
    : sql`"roundTitle" asc, "roundId" asc, position asc, id asc`;
};

export const readApplicationOverviews = async (
  db: Database,
  userId: string,
  input: WorkspaceApplicationsQuery,
  pageSize: number,
) => {
  const needsReviews = Boolean(input.filter.reviews || input.filter.evidence);
  const needsRecommendation = Boolean(
    input.filter.recommendation || input.filter.evidence === "changed" || input.sort === "proposed",
  );
  const selected = and(
    input.roundId ? sql`b."roundId" = ${input.roundId}` : sql`true`,
    // strpos treats %, _, quotes, and backslashes literally.
    input.query
      ? sql`strpos(lower(b.title || ' ' || coalesce(b.applicant, '')), lower(${input.query})) > 0`
      : undefined,
  );
  const offset = sql`least(${input.offset}, greatest(0, (matching - 1) / ${pageSize}) * ${pageSize})`;
  // Materialized facts are shared by count and page; page selection precedes display projections.
  const result = await db.execute<{
    applications: (Record<string, unknown> & { reviews: { criteriaChanged: boolean } })[];
    total: number;
    matching: number;
    offset: number;
  }>(sql`
    with workspace as materialized (${overviewRows(db, userId, input.workspaceSlug)}),
    facts as materialized (
      select b.*, ${needsReviews ? reviewsFor("b") : sql`null::jsonb`} as review_summary,
        ${needsRecommendation ? recommendationFor("b") : sql`null::jsonb`} as recommendation
      from workspace b where ${selected}
    ),
    matched as materialized (select * from facts where ${workFilter(input.filter)}),
    counts as (select (select count(*)::integer from workspace) as total, count(*)::integer as matching from matched),
    page as materialized (
      select * from matched order by ${order(input)} limit ${pageSize}
      offset (select ${offset} from counts)
    ),
    display as materialized (
      select p.id, p.title, p.applicant, p."roundId", p."roundTitle", p.position, p."intakeStatus", p.withdrawn,
        p.requested, ${needsRecommendation ? sql`p.recommendation` : recommendationFor("p")} as recommendation,
        ${needsReviews ? sql`p.review_summary` : reviewsFor("p")} as reviews
      from page p
    )
    select total, matching, ${offset} as offset,
      (select coalesce(jsonb_agg(to_jsonb(d) order by ${order(input)}), '[]'::jsonb) from display d) as applications
    from counts
  `);
  return result.rows[0]!;
};

/** Whole-round aggregates use the same authorized summary facts, independent of list filters. */
export const readRoundTotals = async (
  db: Database,
  userId: string,
  workspaceSlug: string,
  roundId: string,
) => {
  const result = await db.execute<{
    applicationCount: number;
    requested: string;
    proposed: string;
    unknownRequests: number;
    withdrawnApplications: number;
    criteriaImpact: { assessments: number; requests: number };
    reviews: { current: number; outdated: number; outstanding: number; unknown: number };
  }>(sql`
    with applications as materialized (
      select b.*, ${reviewsFor("b")} as reviews, ${recommendationFor("b")} as recommendation
      from (${overviewRows(db, userId, workspaceSlug)}) b where b."roundId" = ${roundId}
    )
    select count(*)::integer as "applicationCount",
      coalesce(sum((requested->>'minorUnits')::numeric) filter (where not withdrawn), 0)::text as requested,
      coalesce(sum((recommendation->'allocation'->>'minorUnits')::numeric) filter (where not withdrawn), 0)::text as proposed,
      count(*) filter (where not withdrawn and requested is null)::integer as "unknownRequests",
      count(*) filter (where withdrawn)::integer as "withdrawnApplications",
      jsonb_build_object(
        'current', coalesce(sum((reviews->>'current')::integer) filter (where not withdrawn), 0),
        'outdated', coalesce(sum((reviews->>'outdated')::integer) filter (where not withdrawn), 0),
        'outstanding', coalesce(sum((reviews->>'outstanding')::integer) filter (where not withdrawn), 0),
        'unknown', coalesce(sum((reviews->>'unknown')::integer) filter (where not withdrawn), 0)
      ) as reviews,
      jsonb_build_object(
        'assessments', coalesce(sum((reviews->>'criteriaAssessments')::integer), 0),
        'requests', coalesce(sum((reviews->>'criteriaRequests')::integer), 0)
      ) as "criteriaImpact"
    from applications
  `);
  return result.rows[0]!;
};
