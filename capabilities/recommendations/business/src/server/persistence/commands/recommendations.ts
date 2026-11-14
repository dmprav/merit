import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationCases } from "@merit/applications/schema";
import { currentMaterial } from "@merit/applications/scope";
import type { Provenance } from "@merit/auth";
import type { Database } from "@merit/db";
import { decodeMoney, moneyDataSchema } from "@merit/money";
import { fundingRounds } from "@merit/rounds/schema";

import type { Recommendation } from "../../../domain/recommendation";
import {
  decodeBudgetContext,
  decodeRecommendation,
  encodeRecommendation,
  recommendationDataSchema,
} from "../encoding";
import { recommendationRevision } from "../projections";
import { currentRecommendation, roundAllocations } from "../projections";
import { recommendationVersions } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const readRecommendationState = async (
  db: Transaction,
  organizationId: string,
  publicId: string,
) => {
  const [row] = await db
    .select({
      title: sql<string>`${currentMaterial}->>'title'`,
      roundId: fundingRounds.id,
      application: sql<unknown>`jsonb_build_object('version', ${applicationCases.materialVersion}, 'managerRecommendation', ${currentRecommendation}, 'requested', (${currentMaterial})->'requested', 'intakeStatus', ${applicationCases.intakeStatus})`,
      round: sql<unknown>`jsonb_build_object('budget', ${sql`case when ${fundingRounds.budget} is null then null else jsonb_build_object('minorUnits', ${fundingRounds.budget}::text, 'currency', ${fundingRounds.currency}) end`})`,
      allocations: roundAllocations,
      recommendationVersion: recommendationRevision,
    })
    .from(applicationCases)
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
  const application = z
    .object({
      version: materialVersionSchema,
      managerRecommendation: z.unknown(),
      requested: moneyDataSchema.nullable(),
      intakeStatus: z.enum(["in_preparation", "ready"]),
    })
    .parse(row.application);
  return {
    recommendationVersion: row.recommendationVersion,
    title: row.title,
    roundId: row.roundId,
    application: {
      ...application,
      managerRecommendation:
        application.managerRecommendation === null
          ? null
          : decodeRecommendation(application.managerRecommendation),
      requested: application.requested === null ? null : decodeMoney(application.requested),
    },
    round: decodeBudgetContext(
      z.object({ budget: z.unknown() }).parse(row.round).budget,
      row.allocations,
    ),
  };
};

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
    applicationVersion: content.recorded?.applicationVersion ?? null,
    actorUserId: input.actorUserId,
    provenance: input.provenance,
    content,
  });
  return true;
};
