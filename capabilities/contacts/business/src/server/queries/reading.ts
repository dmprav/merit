import { z } from "zod";

import { readAuditHistory } from "@merit/audit/server/read";
import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import { contactListInput, contactReadInput, contactHistoryInput } from "../../api/queries";
import { contactDetailsSchema } from "../../domain/index";
import * as reads from "../persistence/queries/reading";

export const listContactSummaries = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof contactListInput>,
) => {
  return readTransaction(db, async (tx) => {
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
  return readTransaction(db, async (tx) => {
    const contact = await reads.readContactDetails(tx, actor.userId, contactReadInput.parse(input));
    return contact ? ({ status: "ok", contact } as const) : ({ status: "not_found" } as const);
  });
};

export const listContactChanges = async (
  db: Database,
  actor: Actor,
  input: z.input<typeof contactHistoryInput>,
) => {
  return readTransaction(db, async (tx) => {
    const request = contactHistoryInput.parse(input);
    if (!(await reads.readContactDetails(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    const workspace = (await reads.readContactWorkspace(tx, actor.userId, request.workspaceSlug))!;
    const page = await readAuditHistory(tx, {
      ...request,
      organizationId: workspace.id,
      targetTypes: ["contact"],
      targetId: request.contactId,
    });
    const snapshot = contactDetailsSchema.extend({ archived: z.boolean() }).strip();
    const entries = page.entries.map((row) => ({
      contactId: request.contactId,
      revision: row.targetRevision!,
      actor: row.actorName,
      actorUserId: row.actorUserId,
      provenance: row.provenance,
      recordedAt: row.recordedAt.toISOString(),
      before: snapshot.nullable().parse(row.details.before),
      after: snapshot.parse(row.details.after),
    }));
    return {
      status: "ok",
      entries,
      nextCursor: page.nextCursor,
    } as const;
  });
};
