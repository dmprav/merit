import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import { contactsRequestSchema, type ContactDirectory } from "../../api/queries";
import type { ContactGrantWork } from "../grant-work";
import { readContacts } from "../persistence/queries/directory";

export const listWorkspaceContacts = async (
  db: Database,
  actor: Actor,
  input: { workspaceSlug: string },
  grantWork: ContactGrantWork,
): Promise<ContactDirectory | { status: "not_found" }> => {
  return readTransaction(db, async (tx) => {
    const request = contactsRequestSchema.parse(input);
    const rows = await readContacts(tx, actor.userId, request.workspaceSlug);
    if (!rows[0]) {
      return { status: "not_found" } as const;
    }

    const titles = await grantWork.applicationTitles(tx, rows[0].organizationId);

    return {
      status: "ok",
      contacts: rows.flatMap((row) =>
        row.contact?.id
          ? [
              {
                ...row.contact,
                applicationTitles: titles.get(row.contact.id) ?? [],
              },
            ]
          : [],
      ),
      workspaceName: rows[0].workspaceName,
    } as const;
  });
};
