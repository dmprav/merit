import { eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import { contacts } from "../schema";

type StoredContact = typeof contacts.$inferSelect;

export const insertContact = (db: Transaction, values: typeof contacts.$inferInsert) =>
  db.insert(contacts).values(values);

export const saveContactProfile = async (
  db: Transaction,
  before: StoredContact | null,
  after: StoredContact,
) => {
  if (
    before &&
    before.name === after.name &&
    before.email === after.email &&
    before.affiliation === after.affiliation &&
    before.archived === after.archived
  ) {
    return before;
  }

  if (before) {
    await db.update(contacts).set(after).where(eq(contacts.id, after.id));
  } else {
    await insertContact(db, after);
  }
  return after;
};
