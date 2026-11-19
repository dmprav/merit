import { and, eq } from "drizzle-orm";

import type { Database } from "@merit/db";

import { contacts } from "./schema";

export const selectContact = (db: Database, organizationId: string, id: string) =>
  db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, id)));

/** Caller must authorize grant work in this organization before reading a contact. */
export const readContact = async (db: Database, organizationId: string, id: string) =>
  (await selectContact(db, organizationId, id))[0];
