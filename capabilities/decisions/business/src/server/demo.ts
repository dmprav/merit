import type { Transaction } from "@merit/db";

import { parseDecision } from "../domain/decision";
import { decisionDataSchema, decodeDecision } from "../domain/encoding";
import { decisionColumns } from "./persistence/commands/decisions";
import { committeeDecisionVersions } from "./persistence/schema";

/** Inserts a trusted, authored first decision; the example author stands in for the recorder. */
export const insertDemoDecision = async (
  db: Transaction,
  value: { caseId: string; content: unknown; actorUserId?: string },
) => {
  const decision = decodeDecision(decisionDataSchema.parse(value.content));
  // A seeded decision obeys the rules a saved one does, such as no date after the recording.
  const { outcome, amount, conditions, reason, decidedBy, decisionDate } = decision;
  const content = { outcome, amount, conditions, reason, decidedBy, decisionDate };
  if (!parseDecision(content, decision.recordedAt).ok) {
    throw new Error("The demo decision breaks the decision rules");
  }
  await db.insert(committeeDecisionVersions).values({
    caseId: value.caseId,
    revision: 1,
    ...decisionColumns(decision, {
      userId: value.actorUserId ?? null,
      provenance: decision.recorder.provenance ?? null,
    }),
  });
};
