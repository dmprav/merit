import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";

import { contactsRequestSchema, type ContactDirectory } from "../../api/queries";
import { linkedApplicationTitles } from "../../domain/linked-applications";
import type { ContactGrantWork } from "../grant-work";
import { readContacts } from "../persistence/queries/directory";

export const listWorkspaceContacts = async (
  db: Database,
  actor: Actor,
  input: { workspaceSlug: string },
  grantWork: ContactGrantWork,
): Promise<ContactDirectory | { status: "not_found" }> => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const request = contactsRequestSchema.parse(input);
    const rows = await readContacts(tx, actor.userId, request.workspaceSlug);
    if (!rows[0]) {
      return { status: "not_found" } as const;
    }

    const { organizationId } = rows[0];
    const titles = linkedApplicationTitles([
      ...(await grantWork.applications.applicationLinks(tx, organizationId)),
      ...(await grantWork.reviews.applicationLinks(tx, organizationId)),
    ]);

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
