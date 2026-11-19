import { eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import { contacts } from "../schema";

export const deleteDemoContacts = (db: Transaction, organizationId: string) =>
  db.delete(contacts).where(eq(contacts.organizationId, organizationId));
