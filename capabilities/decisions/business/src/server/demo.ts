import type { Transaction } from "@merit/db";

import { decisionDataSchema, decodeDecision } from "../domain/encoding";
import { decisionColumns } from "./persistence/commands/decisions";
import { committeeDecisionVersions } from "./persistence/schema";

/** Inserts a trusted, authored first decision; the example author stands in for the recorder. */
export const insertDemoDecision = async (
  db: Transaction,
  value: { caseId: string; content: unknown; actorUserId?: string },
) => {
  const decision = decodeDecision(decisionDataSchema.parse(value.content));
  await db.insert(committeeDecisionVersions).values({
    caseId: value.caseId,
    revision: 1,
    ...decisionColumns(decision, {
      userId: value.actorUserId ?? null,
      provenance: decision.recorder.provenance ?? null,
    }),
  });
};
