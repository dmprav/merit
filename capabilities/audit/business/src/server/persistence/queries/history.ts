import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@merit/db";

import { auditPageInput } from "../../../domain/activity";
import { auditEvents } from "../schema";
import { auditBefore, auditOrder, auditPage } from "./paging";

/** Caller authorizes the workspace and subjects in the same read transaction. */
export const readAuditHistory = async (
  db: Database,
  input: {
    organizationId: string;
    targetTypes: string[];
    targetId?: string;
    assignmentId?: string;
    action?: string;
    after?: string;
    limit?: number;
  },
) => {
  const { after, limit } = auditPageInput.parse({ after: input.after, limit: input.limit });
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, input.organizationId),
        inArray(auditEvents.targetType, input.targetTypes),
        input.targetId ? eq(auditEvents.targetId, input.targetId) : undefined,
        input.assignmentId ? eq(auditEvents.assignmentId, input.assignmentId) : undefined,
        input.action ? eq(auditEvents.action, input.action) : undefined,
        auditBefore(after),
      ),
    )
    .orderBy(...auditOrder)
    .limit(limit + 1);
  return auditPage(rows, limit);
};
