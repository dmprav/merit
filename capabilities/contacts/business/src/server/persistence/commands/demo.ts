import { eq, inArray } from "drizzle-orm";

import { contactChanges } from "../history-schema";
import { contacts } from "../schema";
import type { Transaction } from "../transaction";

export const deleteDemoContacts = async (db: Transaction, organizationId: string) => {
  const ids = db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));
  await db.delete(contactChanges).where(inArray(contactChanges.contactId, ids));
  await db.delete(contacts).where(eq(contacts.organizationId, organizationId));
};
