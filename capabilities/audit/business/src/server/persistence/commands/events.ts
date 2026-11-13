import { eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";

import { auditRecordSchema, type AuditRecord } from "../../../domain/event";
import { auditEvents } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Trusted capability integration. The caller authorizes the action, supplies
 * current identity facts, and holds its locks until this transaction commits. */
export const recordAuditEvent = async (tx: Transaction, input: AuditRecord) => {
  const event = auditRecordSchema.parse(input);
  const name =
    event.actor.name === undefined
      ? ((
          await tx
            .select({ name: appUsers.name })
            .from(appUsers)
            .where(eq(appUsers.id, event.actor.userId))
        )[0]?.name ?? null)
      : event.actor.name;
  await tx.insert(auditEvents).values({
    organizationId: event.organizationId,
    actorUserId: event.actor.userId,
    actorName: name,
    provenance: event.actor.provenance,
    action: event.action,
    targetType: event.target.type,
    targetId: event.target.id,
    targetRevision: event.target.revision,
    targetName: event.target.name,
    roundId: event.context?.roundId,
    applicationId: event.context?.applicationId,
    assignmentId: event.context?.assignmentId,
    formatVersion: event.formatVersion ?? 1,
    details: event.details ?? {},
    recordedAt: event.recordedAt,
  });
};
