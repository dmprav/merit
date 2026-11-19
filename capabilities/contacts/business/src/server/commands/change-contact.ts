import type { Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import { lockGrantWorkspace } from "@merit/organizations/locks";
import { writeWorkspace } from "@merit/organizations/transactions";

import {
  contactCommandSchema,
  type ContactCommand,
  type SaveContactResult,
} from "../../api/commands";
import type { ContactGrantWork } from "../grant-work";
import { recordContactChange } from "../persistence/commands/contacts";
import { lockContactProfile } from "../persistence/commands/locks";

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
  const expectedRevision =
    request.action === "archive" || request.action === "restore"
      ? request.expectedContactRevision
      : null;

  const changeContactTransaction = async (tx: Transaction): Promise<SaveContactResult> => {
    const workspaceMode = request.action === "update" ? "share" : "update";
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, workspaceMode);
    if (!access) {
      return { status: "not_found" };
    }

    const before = await lockContactProfile(
      tx,
      access.organization.id,
      request.contactId,
      "no key update",
    );
    const target = resolveContactTarget(request, expectedRevision, before);
    if ("earlyResult" in target) {
      return target.earlyResult;
    }

    if (target.archived) {
      const outstanding = await grantWork.outstandingRequests(
        tx,
        access.organization.id,
        request.contactId,
      );
      if (outstanding.length > 0) {
        return { status: "invalid", error: "outstanding_requests", outstanding };
      }
    }

    const after = {
      id: request.contactId,
      organizationId: access.organization.id,
      name: target.details.name,
      email: target.details.email,
      affiliation: target.details.affiliation,
      archived: target.archived,
      revision: before ? before.revision + 1 : 0,
    };
    const contact = await recordContactChange(tx, before ?? null, after, actor);
    return { status: "ok", contact };
  };

  return writeWorkspace(db, actor.userId, request.workspaceSlug, changeContactTransaction);
};

type LockedContact = Awaited<ReturnType<typeof lockContactProfile>>;

const resolveContactTarget = (
  request: ContactCommand,
  expectedRevision: number | null,
  before: LockedContact,
):
  | { earlyResult: SaveContactResult }
  | {
      details: { name: string; email: string; affiliation: string };
      archived: boolean;
    } => {
  if (expectedRevision === null && before) {
    return { earlyResult: { status: "ok", contact: before } };
  }
  if (request.action === "update" && !before) {
    return { earlyResult: { status: "not_found" } };
  }
  if (
    request.action !== "create" &&
    request.action !== "update" &&
    (before?.revision ?? null) !== expectedRevision
  ) {
    return { earlyResult: { status: "conflict" } };
  }
  const details = "details" in request ? request.details : before;
  if (!details) {
    return { earlyResult: { status: "not_found" } };
  }
  const archived =
    request.action === "update" ? (before?.archived ?? false) : request.action === "archive";
  return { details, archived };
};
