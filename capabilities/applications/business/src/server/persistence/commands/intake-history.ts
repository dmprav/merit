import { and, eq } from "drizzle-orm";

import { actorProvenance, type Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import { encodeApplicationHistory, type IntakeSnapshot } from "../history-encoding";
import { caseChanges } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const intakeCreationReceipt = async (
  db: Transaction,
  organizationId: string,
  requestId: string,
) =>
  (
    await db
      .select({ publicId: caseChanges.publicId })
      .from(caseChanges)
      .where(
        and(eq(caseChanges.organizationId, organizationId), eq(caseChanges.requestId, requestId)),
      )
  )[0];

export const recordApplicationChange = async (
  tx: Transaction,
  change: {
    organizationId: string;
    publicId: string;
    revision: number;
    actor: Actor;
    action: string;
    reason?: string | null;
    requestId?: string;
    before?: IntakeSnapshot | null;
    after?: IntakeSnapshot | null;
  },
) => {
  const { actor, before, after, ...record } = change;
  await insertIntakeHistory(tx, {
    ...record,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    before: before ? encodeApplicationHistory(before) : null,
    after: after ? encodeApplicationHistory(after) : null,
  });
};

export const insertIntakeHistory = (tx: Transaction, record: typeof caseChanges.$inferInsert) =>
  tx.insert(caseChanges).values(record);
