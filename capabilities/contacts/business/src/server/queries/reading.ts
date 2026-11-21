import { type z } from "zod";

import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";

import { contactListInput, contactReadInput } from "../../api/queries";
import * as reads from "../persistence/queries/reading";

export const listContactSummaries = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof contactListInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const request = contactListInput.parse(input);
    if (!(await reads.readContactWorkspace(tx, actor.userId, request.workspaceSlug))) {
      return { status: "not_found" } as const;
    }
    const rows = await reads.readContactSummaries(tx, actor.userId, request);
    const contacts = rows.slice(0, request.limit);
    return {
      status: "ok",
      contacts,
      nextCursor: rows.length > request.limit ? contacts.at(-1)!.contactId : null,
    } as const;
  });
};

export const getContactDetails = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof contactReadInput>,
) => {
  return readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const contact = await reads.readContactDetails(tx, actor.userId, contactReadInput.parse(input));
    return contact ? ({ status: "ok", contact } as const) : ({ status: "not_found" } as const);
  });
};
