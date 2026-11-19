import type { Transaction } from "@merit/db";

import { recommendationDataSchema } from "../domain/encoding";
import { recommendationColumns } from "./persistence/commands/recommendations";
import { recommendationVersions } from "./persistence/schema";

export const insertDemoRecommendation = async (
  db: Transaction,
  value: {
    caseId: string;
    applicationVersion: number | null | undefined;
    content: unknown;
    actorUserId?: string;
  },
) => {
  const parsed = recommendationDataSchema.parse(value.content);
  await db.insert(recommendationVersions).values({
    caseId: value.caseId,
    revision: 1,
    ...recommendationColumns(parsed),
    applicationVersion: value.applicationVersion ?? parsed.recorded?.applicationVersion ?? null,
    actorUserId: value.actorUserId,
  });
};
