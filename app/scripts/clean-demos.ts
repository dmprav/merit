import { resolve } from "node:path";

import { sql } from "drizzle-orm";

import { removeDemoAudit } from "@merit/audit/server/demo";
import { removeExpiredGuestBatch } from "@merit/auth/server";
import { removeDemoContacts } from "@merit/contacts/server/demo";
import { withDatabase } from "@merit/db";
import { removeDemoFunding } from "@merit/grantmaking/server/demo";
import { canRemoveGuest, removeExpiredDemos } from "@merit/organizations/server/demo";
import { loadEnvLocalFiles } from "@merit/test-support/env";

loadEnvLocalFiles([
  resolve(import.meta.dirname, "../.env.local"),
  resolve(import.meta.dirname, "../../.env.local"),
]);

const connectionString = process.env.DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit";
await withDatabase(connectionString, async (db) => {
  const privileges = await db.execute<{ filtered: boolean }>(
    sql`select bool_or(row_security_active(oid)) as filtered from pg_class
        where relnamespace = 'public'::regnamespace and relrowsecurity`,
  );
  if (privileges.rows[0]?.filtered !== false) {
    throw new Error("Demo cleanup requires the maintenance database credential.");
  }
  let removed;
  do {
    removed = await removeExpiredDemos(db, async (tx, id) => {
      await removeDemoAudit(tx, id);
      await removeDemoFunding(tx, id);
      await removeDemoContacts(tx, id);
    });
  } while (removed === 100);

  let guestCursor: string | null = null;
  do {
    const batch = await removeExpiredGuestBatch(db, canRemoveGuest, guestCursor ?? undefined);
    guestCursor = batch.nextCursor;
  } while (guestCursor !== null);
});
console.log("Expired demo data removed.");
