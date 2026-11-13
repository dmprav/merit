import type { Client } from "pg";

import { recordAuditEvent } from "@merit/audit/server/record";

/** Appends the event, then fails, as a recorder can after a partial write. */
export const failingRecorder: typeof recordAuditEvent = async (tx, event) => {
  await recordAuditEvent(tx, event);
  throw new Error("Recorder failed");
};

/** Recorded events as `action type/id@revision`, sorted so ties in time do not matter. */
export const recordedEvents = async (client: Client, where = "true") =>
  (
    await client.query<{ summary: string }>(
      `SELECT action || ' ' || target_type || '/' || target_id || '@' || coalesce(target_revision::text, '-') AS summary
       FROM audit_events WHERE ${where} ORDER BY 1`,
    )
  ).rows.map((row) => row.summary);
