import type { Database } from "@merit/db";

import { recommendationVersions } from "./persistence/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const insertDemoRecommendation = async (
  db: Transaction,
  value: {
    caseId: string;
    applicationVersion: number | null | undefined;
    content: unknown;
    actorUserId?: string;
  },
) => {
  await db.insert(recommendationVersions).values({
    caseId: value.caseId,
    revision: 1,
    applicationVersion: value.applicationVersion,
    content: value.content,
    actorUserId: value.actorUserId,
  });
};
