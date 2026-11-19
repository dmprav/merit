import { and, eq, sql } from "drizzle-orm";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationCases, materialVersions } from "@merit/applications/schema";
import { requestedMoneyData, roundWithdrawnCount } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Transaction } from "@merit/db";
import { decodeMoney } from "@merit/money";
import { fundingRounds } from "@merit/rounds/schema";
import { toMoneyData } from "@merit/rounds/scope";

import {
  decodeBudgetContext,
  decodeRecommendation,
  encodeRecommendation,
  recommendationDataSchema,
} from "../../../domain/encoding";
import type { Recommendation } from "../../../domain/recommendation";
import { readCurrentRecommendationsMap, readRoundAllocations } from "../projections";
import { recommendationVersions } from "../schema";

export const readRecommendationState = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select({
      title: materialVersions.title,
      requestedMinorUnits: materialVersions.requestedMinorUnits,
      requestedCurrency: materialVersions.requestedCurrency,
      applicationVersion: applicationCases.materialVersion,
      intakeStatus: applicationCases.intakeStatus,
      roundId: fundingRounds.id,
      roundBudget: fundingRounds.budget,
      roundCurrency: fundingRounds.currency,
      withdrawnApplications: roundWithdrawnCount(fundingRounds),
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
      and(eq(applicationCases.organizationId, organizationId), eq(applicationCases.id, publicId)),
    );
  if (!row) {
    return null;
  }

  const [recs, allocations] = await Promise.all([
    readCurrentRecommendationsMap(db, [publicId]),
    readRoundAllocations(db, organizationId, row.roundId),
  ]);
  const current = recs.get(publicId);
  const requestedData = requestedMoneyData(row.requestedMinorUnits, row.requestedCurrency);

  return {
    recommendationVersion: current?.revision ?? 0,
    title: row.title,
    roundId: row.roundId,
    application: {
      version: materialVersionSchema.parse(row.applicationVersion),
      intakeStatus: row.intakeStatus,
      managerRecommendation:
        current === undefined ? null : decodeRecommendation(current.recommendation),
      requested: requestedData === null ? null : decodeMoney(requestedData),
    },
    round: decodeBudgetContext(
      toMoneyData(row.roundBudget, row.roundCurrency),
      allocations,
      row.withdrawnApplications,
    ),
  };
};

export const recommendationColumns = (
  content: ReturnType<typeof recommendationDataSchema.parse>,
  provenance?: Provenance | null,
) => ({
  applicationVersion: content.recorded?.applicationVersion ?? null,
  recordedDate: content.recorded?.date ?? null,
  position: content.position,
  allocationMinorUnits: content.allocation.minorUnits,
  allocationCurrency: content.allocation.currency,
  reasoning: content.reasoning,
  authorUserId: content.author?.userId ?? null,
  authorName: content.author?.name ?? null,
  authorProvenanceInterface: content.author?.provenance?.interface ?? null,
  authorProvenanceClientId:
    content.author?.provenance?.interface === "mcp" ? content.author.provenance.clientId : null,
  provenanceInterface: provenance?.interface ?? null,
  provenanceClientId: provenance?.interface === "mcp" ? provenance.clientId : null,
});

export const writeRecommendation = async (
  db: Transaction,
  input: {
    publicId: string;
    expectedRevision: number;
    actorUserId: string;
    provenance: Provenance;
    after: Recommendation;
  },
) => {
  const [head] = await db
    .select({ revision: sql<number>`coalesce(max(${recommendationVersions.revision}), 0)` })
    .from(recommendationVersions)
    .where(eq(recommendationVersions.caseId, input.publicId));
  if (head!.revision !== input.expectedRevision) {
    return false;
  }
  const content = recommendationDataSchema.parse(encodeRecommendation(input.after));
  await db.insert(recommendationVersions).values({
    caseId: input.publicId,
    revision: input.expectedRevision + 1,
    actorUserId: input.actorUserId,
    ...recommendationColumns(content, input.provenance),
  });
  return true;
};
