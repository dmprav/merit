import { eq } from "drizzle-orm";

import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";

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
  await recordAuditEvent(db, {
    organizationId: after.organizationId,
    actor: { userId: actor.userId, provenance: actorProvenance(actor) },
    action: !before
      ? "contact.created"
      : before.archived !== after.archived
        ? after.archived
          ? "contact.archived"
          : "contact.restored"
        : "contact.updated",
    target: {
      type: "contact",
      id: after.id,
      revision: after.revision,
      name: after.name || after.email,
    },
    details: { before, after },
  });
  return after;
};
