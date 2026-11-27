import { type encodeApplicationMaterial } from "@merit/applications/domain";
import {
  insertIntakeApplication,
  insertDemoMaterialVersion,
  deleteDemoApplications,
} from "@merit/applications/server/demo";
import type { Transaction } from "@merit/db";
import { insertDemoDecision } from "@merit/decisions/server/demo";
import { insertDemoRecommendation } from "@merit/recommendations/server/demo";
import { recordReviewChange } from "@merit/reviews/server/demo";
import { deleteDemoRounds } from "@merit/rounds/server/demo";

import { type encodeApplication, decodeApplication } from "../../../domain/encoding";

export const insertExampleApplication = async (
  db: Transaction,
  value: Parameters<typeof insertIntakeApplication>[1] & {
    snapshot: ReturnType<typeof encodeApplication>;
    decision?: unknown;
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
    await insertDemoMaterialVersion(db, {
      caseId: saved.id,
      content: material.content,
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
    await insertDemoRecommendation(db, {
      caseId: saved.id,
      applicationVersion: application.managerRecommendation.recorded?.applicationVersion,
      content: value.snapshot.managerRecommendation,
      actorUserId: value.recordedByUserId,
    });
  }
  if (value.decision !== undefined) {
    await insertDemoDecision(db, {
      caseId: saved.id,
      content: value.decision,
      actorUserId: value.recordedByUserId,
    });
  }
  return saved;
};

export const deleteDemoFunding = async (db: Transaction, organizationId: string) => {
  await deleteDemoApplications(db, organizationId);
  await deleteDemoRounds(db, organizationId);
};
