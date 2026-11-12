import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { lockGrantWorkspace } from "@merit/organizations/locks";

import {
  contactCommandSchema,
  type ContactCommand,
  type SaveContactResult,
} from "../../api/commands";
import type { ContactGrantWork } from "../grant-work";
import { recordContactChange } from "../persistence/commands/contacts";
import { readContact } from "../persistence/scope";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const changeWorkspaceContact = async (
  db: Database,
  actor: Actor,
  input: ContactCommand,
  grantWork: ContactGrantWork,
): Promise<SaveContactResult> => {
  const parsed = contactCommandSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_contact" };
  }

  const request = parsed.data;
  const expectedRevision = request.action === "create" ? null : request.expectedContactRevision;

  const changeContactTransaction = async (tx: Transaction): Promise<SaveContactResult> => {
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "update");
    if (!access) {
      return { status: "not_found" } as const;
    }

    const before = await readContact(tx, access.organization.id, request.contactId);
    if (expectedRevision === null && before) {
      return { status: "ok", contact: before } as const;
    }
    if ((before?.revision ?? null) !== expectedRevision) {
      return { status: "conflict" } as const;
    }
    const details = "details" in request ? request.details : before;
    if (!details) {
      return { status: "not_found" };
    }
    const archived =
      request.action === "update" ? (before?.archived ?? false) : request.action === "archive";
    if (archived) {
      const outstanding = await grantWork.outstandingRequests(
        tx,
        access.organization.id,
        request.contactId,
      );
      if (outstanding.length) {
        return { status: "invalid", error: "outstanding_requests", outstanding } as const;
      }
    }

    const after = {
      id: request.contactId,
      organizationId: access.organization.id,
      name: details.name,
      email: details.email,
      affiliation: details.affiliation,
      archived,
      revision: before ? before.revision + 1 : 0,
    };
    const contact = await recordContactChange(tx, before ?? null, after, actor);
    return { status: "ok", contact } as const;
  };

  return db.transaction(changeContactTransaction);
};
