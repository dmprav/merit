import { and, desc, eq, inArray, ne, sql, type SQLWrapper } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { activeCase } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Database } from "@merit/db";

import { recommendationVersions } from "./schema";

type RecommendationRow = typeof recommendationVersions.$inferSelect;

export const decodeProvenanceColumns = (
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

export const assembleRecommendationRecord = (row: RecommendationRow) => {
  const provenance = decodeProvenanceColumns(
    row.authorProvenanceInterface,
    row.authorProvenanceClientId,
  );
  return {
    position: row.position,
    allocation: {
      minorUnits: row.allocationMinorUnits,
      currency: row.allocationCurrency as "EUR",
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

export const readRoundAllocations = async (
  db: Database,
  organizationId: string,
  roundId: string,
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
        activeCase("application_cases"),
      ),
    )
    .orderBy(recommendationVersions.caseId, desc(recommendationVersions.revision));
  return rows.map((row) => ({
    minorUnits: row.minorUnits,
    currency: row.currency as "EUR",
  }));
};

export const recommendationRevision = sql<number>`coalesce((select max(r.revision) from ${recommendationVersions} r where r.case_id = ${applicationCases.id}), 0)`;

// A missing recorded basis cannot establish a change in the material.
export const recommendationOverview = (
  db: Database,
  caseId: SQLWrapper,
  materialVersion: SQLWrapper,
) =>
  db
    .select({
      position: recommendationVersions.position,
      allocationMinorUnits: recommendationVersions.allocationMinorUnits,
      allocationCurrency: recommendationVersions.allocationCurrency,
      outdated:
        sql<boolean>`coalesce(${ne(recommendationVersions.applicationVersion, materialVersion)}, false)`.as(
          "recommendation_outdated",
        ),
    })
    .from(recommendationVersions)
    .where(eq(recommendationVersions.caseId, caseId))
    .orderBy(desc(recommendationVersions.revision))
    .limit(1)
    .as("recommendation_overview");
