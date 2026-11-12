import type { Database } from "@merit/db";

import { auditRecordSchema, type AuditRecord } from "../../../domain/event";
import { auditEvents } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Trusted capability integration. The caller authorizes the action, supplies
 * current identity facts, and holds its locks until this transaction commits. */
export const recordAuditEvent = async (tx: Transaction, input: AuditRecord) => {
  const event = auditRecordSchema.parse(input);
  await tx.insert(auditEvents).values({
    organizationId: event.organizationId,
    actorUserId: event.actor.userId,
    actorName: event.actor.name,
    provenance: event.actor.provenance,
    action: event.action,
    targetType: event.target.type,
    targetId: event.target.id,
    targetRevision: event.target.revision,
  });
};
