import { and, desc, eq, inArray, lte, ne, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { activeCase } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Database } from "@merit/db";

import { recommendationVersions } from "./schema";

type RecommendationRow = typeof recommendationVersions.$inferSelect;

const decodeProvenanceColumns = (
  interfaceValue: string | null,
  clientId: string | null,
): Provenance | undefined => {
  if (interfaceValue === "web") {
    return { interface: "web" };
  }
  if (interfaceValue === "mcp" && clientId) {
    return { interface: "mcp", clientId };
  }
  return undefined;
};

const euroCurrency = (currency: string): "EUR" => {
  if (currency !== "EUR") {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return currency;
};

const assembleRecommendationRecord = (row: RecommendationRow) => {
  const provenance = decodeProvenanceColumns(
    row.authorProvenanceInterface,
    row.authorProvenanceClientId,
  );
  return {
    position: row.position,
    allocation: {
      minorUnits: row.allocationMinorUnits,
      currency: euroCurrency(row.allocationCurrency),
    },
    reasoning: row.reasoning,
    ...(row.authorName !== null
      ? {
          author: {
            ...(row.authorUserId !== null ? { userId: row.authorUserId } : {}),
            name: row.authorName,
            ...(provenance ? { provenance } : {}),
          },
        }
      : {}),
    ...(row.recordedDate !== null && row.applicationVersion !== null
      ? { recorded: { date: row.recordedDate, applicationVersion: row.applicationVersion } }
      : {}),
  };
};

export const readRecommendationChange = async (db: Database, caseId: string, revision: number) => {
  const [current, previous] = await db
    .select()
    .from(recommendationVersions)
    .where(
      and(
        eq(recommendationVersions.caseId, caseId),
        lte(recommendationVersions.revision, revision),
      ),
    )
    .orderBy(desc(recommendationVersions.revision))
    .limit(2);
  if (current?.revision !== revision) {
    return undefined;
  }
  return {
    revision: current.revision,
    actorUserId: current.actorUserId,
    provenance:
      decodeProvenanceColumns(current.provenanceInterface, current.provenanceClientId) ?? null,
    recordedAt: current.recordedAt.toISOString(),
    before: previous ? assembleRecommendationRecord(previous) : null,
    after: assembleRecommendationRecord(current),
  };
};

export const readCurrentRecommendationsMap = async (db: Database, caseIds: string[]) => {
  const uniqueIds = [...new Set(caseIds)];
  const result = new Map<
    string,
    { revision: number; recommendation: ReturnType<typeof assembleRecommendationRecord> }
  >();
  if (uniqueIds.length === 0) {
    return result;
  }
  const rows = await db
    .selectDistinctOn([recommendationVersions.caseId])
    .from(recommendationVersions)
    .where(inArray(recommendationVersions.caseId, uniqueIds))
    .orderBy(recommendationVersions.caseId, desc(recommendationVersions.revision));
  for (const row of rows) {
    result.set(row.caseId, {
      revision: row.revision,
      recommendation: assembleRecommendationRecord(row),
    });
  }
  return result;
};

/** Current allocations of the round's active cases, plus `includedCaseId` when it is withdrawn. */
export const readRoundAllocations = async (
  db: Database,
  organizationId: string,
  roundId: string,
  includedCaseId?: string,
) => {
  const rows = await db
    .selectDistinctOn([recommendationVersions.caseId], {
      minorUnits: recommendationVersions.allocationMinorUnits,
      currency: recommendationVersions.allocationCurrency,
    })
    .from(recommendationVersions)
    .innerJoin(applicationCases, eq(applicationCases.id, recommendationVersions.caseId))
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(applicationCases.roundId, roundId),
        includedCaseId === undefined
          ? activeCase("application_cases")
          : or(activeCase("application_cases"), eq(applicationCases.id, includedCaseId)),
      ),
    )
    .orderBy(recommendationVersions.caseId, desc(recommendationVersions.revision));
  return rows.map((row) => ({
    minorUnits: row.minorUnits,
    currency: euroCurrency(row.currency),
  }));
};

export const hasRecommendation = (caseId: string) => sql<boolean>`exists (
  select 1 from ${recommendationVersions} where ${recommendationVersions.caseId} = ${caseId}
)`;

export const recommendationRevision = sql<number>`coalesce((select max(r.revision) from ${recommendationVersions} r where r.case_id = ${applicationCases.id}), 0)`;

// A missing recorded basis cannot establish a change in the material.
const overviewFields = (materialVersion: SQLWrapper) => ({
  position: recommendationVersions.position,
  allocationMinorUnits: recommendationVersions.allocationMinorUnits,
  allocationCurrency: recommendationVersions.allocationCurrency,
  outdated:
    sql<boolean>`coalesce(${ne(recommendationVersions.applicationVersion, materialVersion)}, false)`.as(
      "recommendation_outdated",
    ),
});

export const recommendationOverview = (
  db: Database,
  caseId: SQLWrapper,
  materialVersion: SQLWrapper,
) =>
  db
    .select(overviewFields(materialVersion))
    .from(recommendationVersions)
    .where(eq(recommendationVersions.caseId, caseId))
    .orderBy(desc(recommendationVersions.revision))
    .limit(1)
    .as("recommendation_overview");

/** Latest recommendations among the candidate cases for filtering and sorting. */
export const candidateRecommendationOverviews = (
  db: Database,
  candidates: SQL,
  caseId: SQLWrapper,
  materialVersion: SQLWrapper,
) =>
  db
    .selectDistinctOn([recommendationVersions.caseId], {
      caseId: recommendationVersions.caseId,
      ...overviewFields(materialVersion),
    })
    .from(recommendationVersions)
    .innerJoin(candidates, eq(recommendationVersions.caseId, caseId))
    .orderBy(recommendationVersions.caseId, desc(recommendationVersions.revision))
    .as("recommendation_overview");
