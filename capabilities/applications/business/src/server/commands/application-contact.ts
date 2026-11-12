import type { Actor } from "@merit/auth";
import { readContact } from "@merit/contacts/scope";
import type { Database } from "@merit/db";

import {
  selectContactRequestSchema,
  type SelectContactRequest,
} from "../../api/commands/application-contact";
import { withIntakeContact } from "../../domain/intake-recording";
import { findIntakeApplication, recordIntakeChange } from "../persistence/commands/intake";
import { lockApplicationCase } from "../persistence/locks";

export const selectApplicationContact = async (
  db: Database,
  actor: Actor,
  input: SelectContactRequest,
) => {
  const request = selectContactRequestSchema.parse(input);

  return db.transaction(async (tx) => {
    const access = await lockApplicationCase(tx, actor.userId, request);
    if (!access) {
      return { status: "not_found" } as const;
    }

    const row = await findIntakeApplication(tx, access.organizationId, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (row.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    const contact = request.contactId
      ? await readContact(tx, access.organizationId, request.contactId)
      : null;
    if (request.contactId && (!contact || contact.archived)) {
      return { status: "invalid", error: "contact_unavailable" } as const;
    }

    if (row.application.contactId === request.contactId) {
      return { status: "ok", revision: row.revision } as const;
    }

    const revision = await recordIntakeChange(
      tx,
      row,
      {
        application: withIntakeContact(row.application, request.contactId, contact ?? null),
        workingRevision: row.workingRevision,
        action: "details",
        reason: null,
      },
      actor,
    );
    return { status: "ok", revision } as const;
  });
};
