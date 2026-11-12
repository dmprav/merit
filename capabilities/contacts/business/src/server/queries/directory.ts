import { z } from "zod";

import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import { contactsRequestSchema, type ContactDirectory } from "../../api/queries";
import { contactDetailsSchema } from "../../domain/index";
import type { ContactGrantWork } from "../grant-work";
import { readContacts, readContactHistory } from "../persistence/queries/directory";

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

    const [titles, history] = await Promise.all([
      grantWork.applicationTitles(tx, rows[0].organizationId),
      readContactHistory(tx, rows[0].organizationId),
    ]);

    return {
      status: "ok",
      contacts: rows.flatMap((row) =>
        row.contact?.id
          ? [
              {
                ...row.contact,
                applicationTitles: titles.get(row.contact.id) ?? [],
                history: history
                  .filter((entry) => entry.contactId === row.contact!.id)
                  .map((entry) => ({
                    ...entry,
                    recordedAt: entry.recordedAt.toISOString(),
                    before:
                      entry.before === null
                        ? null
                        : contactDetailsSchema
                            .extend({ archived: z.boolean() })
                            .strip()
                            .parse(entry.before),
                    after: contactDetailsSchema
                      .extend({ archived: z.boolean() })
                      .strip()
                      .parse(entry.after),
                  })),
              },
            ]
          : [],
      ),
      workspaceName: rows[0].workspaceName,
    } as const;
  });
};
