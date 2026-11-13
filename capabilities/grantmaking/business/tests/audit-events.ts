import type { Client } from "pg";

/** Fail at commit, after the event and business writes have both happened. */
export const withAuditFailure = async <T>(client: Client, operation: () => Promise<T>) => {
  await client.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Audit recording failed'; END $$;
    CREATE CONSTRAINT TRIGGER reject_test_audit AFTER INSERT ON audit_events
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
  try {
    return await operation();
  } finally {
    await client.query(
      "DROP TRIGGER reject_test_audit ON audit_events; DROP FUNCTION reject_test_audit()",
    );
  }
};

/** Recorded events as `action type/id@revision`, sorted so ties in time do not matter. */
export const recordedEvents = async (client: Client, where = "true") =>
  (
    await client.query<{ summary: string }>(
      `SELECT action || ' ' || target_type || '/' || target_id || '@' || coalesce(target_revision::text, '-') AS summary
       FROM audit_events WHERE ${where} ORDER BY 1`,
    )
  ).rows.map((row) => row.summary);
