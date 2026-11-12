import { eq } from "drizzle-orm";

import { type encodeApplicationMaterial } from "@merit/applications/encoding";
import { materialVersions } from "@merit/applications/schema";
import { insertIntakeApplication, deleteDemoApplications } from "@merit/applications/server/demo";
import type { Database } from "@merit/db";
import { recommendationVersions } from "@merit/recommendations/schema";
import { recordReviewChange } from "@merit/reviews/server/demo";
import { fundingRounds, roundChanges } from "@merit/rounds/schema";

import { type encodeApplication, decodeApplication } from "../encoding";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const insertExampleApplication = async (
  db: Transaction,
  value: Parameters<typeof insertIntakeApplication>[1] & {
    snapshot: ReturnType<typeof encodeApplication>;
    earlierMaterial?: {
      content: ReturnType<typeof encodeApplicationMaterial>;
      reason: string;
      recordedAt: Date;
    }[];
  },
) => {
  const application = decodeApplication(value.snapshot);
  const saved = await insertIntakeApplication(db, {
    ...value,
    source: { kind: "fictional_example" },
  });
  for (const material of value.earlierMaterial ?? []) {
    await db.insert(materialVersions).values({
      caseId: saved.id,
      version: material.content.version,
      content: material.content,
      changeKind: "recorded",
      source: { kind: "fictional_example" },
      reason: material.reason,
      recordedByUserId: value.recordedByUserId,
      recordedAt: material.recordedAt,
    });
  }
  await recordReviewChange(
    db,
    {
      publicId: saved.id,
      organizationId: value.organizationId,
      roundId: value.roundId,
      reviews: null,
    },
    application.reviews,
  );
  if (application.managerRecommendation) {
    const recommendation = value.snapshot.managerRecommendation;
    await db.insert(recommendationVersions).values({
      caseId: saved.id,
      revision: 1,
      applicationVersion: application.managerRecommendation.recorded?.applicationVersion,
      content: recommendation,
      actorUserId: value.recordedByUserId,
    });
  }
  return saved;
};

export const deleteDemoFunding = async (db: Transaction, organizationId: string) => {
  await deleteDemoApplications(db, organizationId);
  await db.delete(roundChanges).where(eq(roundChanges.organizationId, organizationId));
  await db.delete(fundingRounds).where(eq(fundingRounds.organizationId, organizationId));
};
