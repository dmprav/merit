import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { caseWithdrawn } from "@merit/applications/scope";
import type { Database } from "@merit/db";
import { recommendationOverview } from "@merit/recommendations/scope";
import { reviewOverview } from "@merit/reviews/scope";
import { fundingRounds } from "@merit/rounds/schema";

const roundApplications = (
  db: Database,
  organizationId: SQLWrapper | string,
  roundId: SQLWrapper | string,
) => {
  const recommendation = recommendationOverview(
    db,
    applicationCases.id,
    applicationCases.materialVersion,
  );
  return db
    .select({
      id: applicationCases.id,
      version: applicationCases.materialVersion,
      withdrawn: caseWithdrawn.as("withdrawn"),
      requested: materialVersions.requestedMinorUnits,
      proposed: recommendation.allocationMinorUnits,
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .leftJoinLateral(recommendation, sql`true`)
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(applicationCases.roundId, roundId),
      ),
    )
    .as("round_applications");
};

const financialTotals = (a: ReturnType<typeof roundApplications>) => ({
  applicationCount: sql<number>`count(*)::integer`.as("application_count"),
  requested:
    sql<string>`coalesce(sum(${a.requested}) filter (where not ${a.withdrawn}), 0)::text`.as(
      "requested",
    ),
  proposed: sql<string>`coalesce(sum(${a.proposed}) filter (where not ${a.withdrawn}), 0)::text`.as(
    "proposed",
  ),
  unknownRequests:
    sql<number>`count(*) filter (where not ${a.withdrawn} and ${a.requested} is null)::integer`.as(
      "unknown_requests",
    ),
  withdrawnApplications: sql<number>`count(*) filter (where ${a.withdrawn})::integer`.as(
    "withdrawn_applications",
  ),
});

export const roundFinancialTotals = (db: Database) => {
  const applications = roundApplications(db, fundingRounds.organizationId, fundingRounds.id);
  return db.select(financialTotals(applications)).from(applications).as("round_totals");
};

// The caller has authorized this round in the same read transaction.
export const readRoundPageTotals = async (
  db: Database,
  organizationId: string,
  round: { id: string; criteriaVersion: number },
) => {
  const applications = roundApplications(db, organizationId, round.id);
  const reviews = reviewOverview(
    db,
    applications.id,
    applications.version,
    sql`${round.id}`,
    sql`${round.criteriaVersion}`,
  );

  const activeReviews = (count: SQLWrapper) =>
    sql<number>`coalesce(sum(${count}) filter (where not ${applications.withdrawn}), 0)::integer`;

  const [totals] = await db
    .select({
      ...financialTotals(applications),
      reviews: {
        current: activeReviews(reviews.current),
        outdated: activeReviews(reviews.outdated),
        outstanding: activeReviews(reviews.outstanding),
        unknown: activeReviews(reviews.unknown),
      },
      criteriaImpact: {
        assessments: sql<number>`coalesce(sum(${reviews.criteriaAssessments}), 0)::integer`,
        requests: sql<number>`coalesce(sum(${reviews.criteriaRequests}), 0)::integer`,
      },
    })
    .from(applications)
    .crossJoinLateral(reviews);
  if (!totals) {
    throw new Error("Round totals query returned no row.");
  }
  return totals;
};
