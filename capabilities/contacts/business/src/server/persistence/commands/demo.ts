import { eq } from "drizzle-orm";

import { contacts } from "../schema";
import type { Transaction } from "../transaction";

export const deleteDemoContacts = (db: Transaction, organizationId: string) =>
  db.delete(contacts).where(eq(contacts.organizationId, organizationId));
