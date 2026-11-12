import { insertContact } from "./persistence/commands/contacts";
import { deleteDemoContacts } from "./persistence/commands/demo";
import type { Transaction } from "./persistence/transaction";

/** Trusted fictional-workspace provisioning only; all writes use the caller's transaction. */
export const seedExampleContacts = async (
  db: Transaction,
  organizationId: string,
  people: { id: string; name: string; email?: string }[],
) => {
  const ids = new Map<string, string>();
  for (const person of people) {
    if (ids.has(person.id)) {
      continue;
    }

    const id = crypto.randomUUID();
    await insertContact(db, {
      id,
      organizationId,
      name: person.name,
      email: person.email ?? "",
      affiliation: "",
      archived: false,
      revision: 0,
    });
    ids.set(person.id, id);
  }

  return ids;
};

/** Called only after the organizations module locks and verifies an expired demo. */
export const removeDemoContacts = (db: Transaction, organizationId: string) =>
  deleteDemoContacts(db, organizationId);
