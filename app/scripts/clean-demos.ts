import { removeDemoAudit } from "@merit/audit/server/demo";
import { removeExpiredGuestBatch } from "@merit/auth/server";
import { removeDemoContacts } from "@merit/contacts/server/demo";
import { withDatabase } from "@merit/db";
import { removeDemoFunding } from "@merit/grantmaking/server/demo";
import { canRemoveGuest, removeExpiredDemos } from "@merit/organizations/server/demo";

const connectionString = process.env.DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit";
await withDatabase(connectionString, async (db) => {
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
