import { and, desc, eq, inArray, sql } from "drizzle-orm";

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
    .select()
    .from(recommendationVersions)
    .where(inArray(recommendationVersions.caseId, uniqueIds))
    .orderBy(desc(recommendationVersions.revision));
  for (const row of rows) {
    if (!result.has(row.caseId)) {
      result.set(row.caseId, {
        revision: row.revision,
        recommendation: assembleRecommendationRecord(row),
      });
    }
  }
  return result;
};

export const readRoundAllocations = async (
  db: Database,
  organizationId: string,
  roundId: string,
) => {
  const activeCases = await db
    .select({ id: applicationCases.id })
    .from(applicationCases)
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(applicationCases.roundId, roundId),
        activeCase("application_cases"),
      ),
    );
  const recs = await readCurrentRecommendationsMap(
    db,
    activeCases.map((row) => row.id),
  );
  return [...recs.values()].map((entry) => entry.recommendation.allocation);
};

export const recommendationRevision = sql<number>`coalesce((select max(r.revision) from ${recommendationVersions} r where r.case_id = ${applicationCases.id}), 0)`;
