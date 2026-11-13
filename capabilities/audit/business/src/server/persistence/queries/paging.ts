import { desc, sql } from "drizzle-orm";

import { decodeActivityCursor, encodeActivityCursor } from "../../../domain/activity";
import { auditEvents } from "../schema";

export const auditOrder = [desc(auditEvents.recordedAt), desc(auditEvents.id)];

export const auditBefore = (after?: string) => {
  const cursor = after ? decodeActivityCursor(after) : null;
  return cursor
    ? sql`(${auditEvents.recordedAt}, ${auditEvents.id}) < (${cursor.recordedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
    : undefined;
};

export const auditPage = <T extends { id: string; recordedAt: Date }>(rows: T[], limit: number) => {
  const entries = rows.slice(0, limit);
  const last = entries.at(-1);
  return {
    entries,
    nextCursor: rows.length > limit && last ? encodeActivityCursor(last) : null,
  };
};
