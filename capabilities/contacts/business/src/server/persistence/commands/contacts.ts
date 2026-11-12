import { eq } from "drizzle-orm";

import { actorProvenance, type Actor } from "@merit/auth";

import { contactChanges } from "../history-schema";
import { contacts } from "../schema";
import type { Transaction } from "../transaction";

type StoredContact = typeof contacts.$inferSelect;

export const insertContact = (db: Transaction, values: typeof contacts.$inferInsert) =>
  db.insert(contacts).values(values);

export const recordContactChange = async (
  db: Transaction,
  before: StoredContact | null,
  after: StoredContact,
  actor: Actor,
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
  await db.insert(contactChanges).values({
    contactId: after.id,
    revision: after.revision,
    actorUserId: actor.userId,
    provenance: actorProvenance(actor),
    before,
    after,
  });
  return after;
};
