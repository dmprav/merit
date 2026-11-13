import { and, eq } from "drizzle-orm";

import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor, type Provenance } from "@merit/auth";
import type { Database } from "@merit/db";

import { encodeApplicationHistory, type IntakeSnapshot } from "../history-encoding";
import { applicationCreationReceipts } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const intakeCreationReceipt = async (
  db: Transaction,
  organizationId: string,
  requestId: string,
) =>
  (
    await db
      .select({ publicId: applicationCreationReceipts.publicId })
      .from(applicationCreationReceipts)
      .where(
        and(
          eq(applicationCreationReceipts.organizationId, organizationId),
          eq(applicationCreationReceipts.requestId, requestId),
        ),
      )
  )[0];

const actions = {
  create: "application.created",
  save_content: "application.material_changed",
  mark_ready: "application.marked_ready",
  revision: "application.revision_recorded",
  correction: "application.correction_recorded",
  delete: "application.deleted",
  start_revision: "application_working_revision.started",
  save_revision: "application_working_revision.updated",
  discard_revision: "application_working_revision.discarded",
  details: "application.summary_changed",
  contact: "application.contact_changed",
} as const;

export const recordApplicationChange = async (
  tx: Transaction,
  change: {
    organizationId: string;
    publicId: string;
    roundId: string | null;
    revision: number;
    provenance?: Provenance | null;
    recordedAt?: Date;
    actor: Actor;
    action: keyof typeof actions;
    reason?: string | null;
    before?: IntakeSnapshot | null;
    after?: IntakeSnapshot | null;
  },
) => {
  await recordAuditEvent(tx, {
    organizationId: change.organizationId,
    actor: {
      userId: change.actor.userId,
      provenance:
        change.provenance === undefined ? actorProvenance(change.actor) : change.provenance,
    },
    action: actions[change.action],
    recordedAt: change.recordedAt,
    target: {
      type: "application",
      id: change.publicId,
      revision: change.revision,
      name: (change.after ?? change.before)?.application.title,
    },
    context: { roundId: change.roundId, applicationId: change.publicId },
    details: {
      reason: change.reason ?? null,
      before: change.before ? encodeApplicationHistory(change.before) : null,
      after: change.after ? encodeApplicationHistory(change.after) : null,
    },
  });
};
