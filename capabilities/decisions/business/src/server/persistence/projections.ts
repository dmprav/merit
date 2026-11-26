import { and, desc, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { activeCase } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Database } from "@merit/db";

import type { DecisionStateData } from "../../domain/encoding";
import { committeeDecisionVersions } from "./schema";

type DecisionRow = typeof committeeDecisionVersions.$inferSelect;

const decodeProvenance = (
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

const assembleDecisionRecord = (row: DecisionRow) => {
  const provenance = decodeProvenance(row.provenanceInterface, row.provenanceClientId);
  return {
    outcome: row.outcome,
    amount: { minorUnits: row.amountMinorUnits, currency: euroCurrency(row.amountCurrency) },
    conditions: row.conditions ?? "",
    reason: row.reason,
    decidedBy: row.decidedBy,
    decisionDate: row.decisionDate,
    ...(row.changeExplanation !== null ? { changeExplanation: row.changeExplanation } : {}),
    recorder: {
      ...(row.actorUserId !== null ? { userId: row.actorUserId } : {}),
      name: row.actorName,
      ...(provenance ? { provenance } : {}),
    },
    recordedAt: row.recordedAt.toISOString(),
    applicationVersion: row.applicationVersion,
  };
};

/** Every version of each case's decision, newest first, with the case's current revision. */
export const readDecisionStatesMap = async (db: Database, caseIds: string[]) => {
  const uniqueIds = [...new Set(caseIds)];
  const result = new Map<string, DecisionStateData>();
  if (uniqueIds.length === 0) {
    return result;
  }
  const rows = await db
    .select()
    .from(committeeDecisionVersions)
    .where(inArray(committeeDecisionVersions.caseId, uniqueIds))
    .orderBy(committeeDecisionVersions.caseId, desc(committeeDecisionVersions.revision));
  for (const row of rows) {
    const state = result.get(row.caseId) ?? { revision: row.revision, versions: [] };
    state.versions.push({ revision: row.revision, decision: assembleDecisionRecord(row) });
    result.set(row.caseId, state);
  }
  return result;
};

export const readDecisionChange = async (db: Database, caseId: string, revision: number) => {
  const [version] = await db
    .select()
    .from(committeeDecisionVersions)
    .where(
      and(
        eq(committeeDecisionVersions.caseId, caseId),
        eq(committeeDecisionVersions.revision, revision),
      ),
    );
  return version ? { revision, decision: assembleDecisionRecord(version) } : undefined;
};

/** Current commitments of the round's active cases, plus `includedCaseId` when it is withdrawn. */
export const readRoundCommitments = async (
  db: Database,
  organizationId: string,
  roundId: string,
  includedCaseId?: string,
) => {
  const rows = await db
    .selectDistinctOn([committeeDecisionVersions.caseId], {
      minorUnits: committeeDecisionVersions.amountMinorUnits,
      currency: committeeDecisionVersions.amountCurrency,
      outcome: committeeDecisionVersions.outcome,
    })
    .from(committeeDecisionVersions)
    .innerJoin(applicationCases, eq(applicationCases.id, committeeDecisionVersions.caseId))
    .where(
      and(
        eq(applicationCases.organizationId, organizationId),
        eq(applicationCases.roundId, roundId),
        includedCaseId === undefined
          ? activeCase("application_cases")
          : or(activeCase("application_cases"), eq(applicationCases.id, includedCaseId)),
      ),
    )
    .orderBy(committeeDecisionVersions.caseId, desc(committeeDecisionVersions.revision));
  return rows
    .filter((row) => row.outcome === "Fund" || row.outcome === "Fund with conditions")
    .map((row) => ({ minorUnits: row.minorUnits, currency: euroCurrency(row.currency) }));
};

export const hasDecision = (caseId: string) => sql<boolean>`exists (
  select 1 from ${committeeDecisionVersions} where ${committeeDecisionVersions.caseId} = ${caseId}
)`;

export const decisionRevision = sql<number>`coalesce((select max(d.revision) from ${committeeDecisionVersions} d where d.case_id = ${applicationCases.id}), 0)`;

/** The latest decision of one case: its outcome and what it commits (zero unless it funds). */
export const decisionOverview = (db: Database, caseId: SQLWrapper) =>
  db
    .select({
      outcome: committeeDecisionVersions.outcome,
      amountMinorUnits: committeeDecisionVersions.amountMinorUnits,
      amountCurrency: committeeDecisionVersions.amountCurrency,
      committedMinorUnits:
        sql<string>`case when ${committeeDecisionVersions.outcome} in ('Fund', 'Fund with conditions') then ${committeeDecisionVersions.amountMinorUnits} else 0 end`.as(
          "decision_committed",
        ),
    })
    .from(committeeDecisionVersions)
    .where(eq(committeeDecisionVersions.caseId, caseId))
    .orderBy(desc(committeeDecisionVersions.revision))
    .limit(1)
    .as("decision_overview");

/** The latest decision's outcome as JSON, or null when none exists; for list rows. */
export const currentDecisionRecord = (caseId: SQLWrapper) => sql`(
  select jsonb_build_object('outcome', d.outcome) from ${committeeDecisionVersions} d
  where d.case_id = ${caseId} order by d.revision desc limit 1)`;
