import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@merit/db";

import { auditEvents } from "../schema";
import { auditBefore, auditOrder } from "./paging";

export const readActivityEvents = (
  db: Database,
  organizationId: string,
  filter: {
    actorUserId?: string;
    roundId?: string;
    targetTypes: string[];
    reasonActions: string[];
    after?: string;
    limit: number;
  },
) =>
  db
    .select({
      id: auditEvents.id,
      actorUserId: auditEvents.actorUserId,
      actorName: auditEvents.actorName,
      provenance: auditEvents.provenance,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      targetRevision: auditEvents.targetRevision,
      targetName: auditEvents.targetName,
      roundId: auditEvents.roundId,
      applicationId: auditEvents.applicationId,
      assignmentId: auditEvents.assignmentId,
      recordedAt: auditEvents.recordedAt,
      reason: filter.reasonActions.length
        ? sql<
            string | null
          >`case when ${inArray(auditEvents.action, filter.reasonActions)} then ${auditEvents.details}->>'reason' end`
        : sql<string | null>`null`,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        filter.roundId ? eq(auditEvents.roundId, filter.roundId) : undefined,
        inArray(auditEvents.targetType, filter.targetTypes),
        filter.actorUserId ? eq(auditEvents.actorUserId, filter.actorUserId) : undefined,
        auditBefore(filter.after),
      ),
    )
    .orderBy(...auditOrder)
    .limit(filter.limit + 1);

/** Latest recorded name per person, without accumulating every historical name. */
export const readActivityPeople = (db: Database, organizationId: string, targetTypes: string[]) =>
  db
    .selectDistinctOn([auditEvents.actorUserId], {
      userId: auditEvents.actorUserId,
      name: auditEvents.actorName,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        inArray(auditEvents.targetType, targetTypes),
      ),
    )
    .orderBy(
      auditEvents.actorUserId,
      sql`${auditEvents.actorName} is null`,
      desc(auditEvents.recordedAt),
      desc(auditEvents.id),
    );
